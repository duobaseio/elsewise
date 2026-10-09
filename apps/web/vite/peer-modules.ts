import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { init, parse } from 'es-module-lexer';
import { type Plugin, type ResolvedConfig, transformWithOxc, type ViteDevServer } from 'vite';

/**
 * A Vite plugin that allows Elsewise and its separately bundled plugins to share one instance of each module specified
 * by `specifiers`.
 *
 * Without this, Elsewise and its plugins will each have their own distinct copy of a module, e.g. React, and two React
 * modules break context and hooks.
 *
 * For each specifier, a **facade module** that re-exports everything from a peer module (minified during bundling) is
 * generated. The facade module is then injected into the import map in `index.html`.
 */
export function peerModules(specifiers: readonly string[]): Plugin[] {
  return [build(specifiers), serve(specifiers)];
}

function build(specifiers: readonly string[]): Plugin {
  // The id prefix of a peer module's facade, e.g. `\0peer:react`.
  const prefix = '\0peer:';

  let config: ResolvedConfig;
  return {
    name: 'peer-modules:build',
    apply: 'build',

    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },

    // Adds the (not yet generated) facades as entry points.
    buildStart() {
      for (const specifier of specifiers) {
        this.emitFile({
          type: 'chunk',
          id: prefix + specifier,
          name: `peer/${specifier.replace(/^@/, '')}`,
          // Prevents a facade's exports from being tree-shaken since the facade is unused in Elsewise.
          preserveSignature: 'strict',
        });
      }
    },

    // Claims the facades emitted in `buildStart`, which would otherwise be resolved as files.
    resolveId(id) {
      return id.startsWith(prefix) ? id : null;
    },

    async load(id) {
      if (!id.startsWith(prefix)) {
        return;
      }

      const specifier = id.slice(prefix.length);
      const resolved = (await this.resolve(specifier))?.id;
      if (!resolved) {
        this.error(`Cannot resolve ${specifier}`);
      }

      return facade(specifier, resolved.split('?')[0]);
    },

    transformIndexHtml: {
      order: 'post',
      handler(_html, { bundle }) {
        // Import map must precede the module scripts and modulepreload links that resolve through it.
        const imports = Object.fromEntries(
          specifiers.map((specifier) => {
            const chunk = Object.values(bundle ?? {}).find(
              (output) => output.type === 'chunk' && output.facadeModuleId === prefix + specifier,
            );
            if (!chunk) {
              throw new Error(`No chunk for peer module ${specifier}`);
            }

            return [specifier, config.base + chunk.fileName];
          }),
        );
        return [
          {
            tag: 'script',
            attrs: { type: 'importmap' },
            children: JSON.stringify({ imports }, null, 2),
            injectTo: 'head-prepend',
          },
        ];
      },
    },
  };
}

function serve(specifiers: readonly string[]): Plugin {
  // The path under `base` that the dev server serves a peer module's facade at, e.g. `/@peer/react`.
  const devPath = '@peer/';

  let server: ViteDevServer;
  return {
    name: 'peer-modules:serve',
    apply: 'serve',

    // Excludes workspace packages from pre-bundling to preserve HMR.
    config(userConfig) {
      const root = path.resolve(userConfig.root ?? '');
      const include = specifiers.filter((specifier) => {
        const name = specifier.split('/', specifier.startsWith('@') ? 2 : 1).join('/');
        return realpathSync(path.join(root, 'node_modules', name)).includes(`${path.sep}node_modules${path.sep}`);
      });
      return { optimizeDeps: { include } };
    },

    configureServer(devServer) {
      server = devServer;
    },

    transformIndexHtml: {
      order: 'post',
      handler() {
        // Import map must precede the module scripts and modulepreload links that resolve through it.
        const imports = Object.fromEntries(
          specifiers.map((specifier) => [specifier, server.config.base + devPath + specifier]),
        );
        return [
          {
            tag: 'script',
            attrs: { type: 'importmap' },
            children: JSON.stringify({ imports }, null, 2),
            injectTo: 'head-prepend',
          },
        ];
      },
    },

    // Dev server replaces `base` from the import map's URLs with `/`.
    resolveId(id) {
      return id.startsWith(`/${devPath}`) ? id : null;
    },

    async load(id) {
      if (!id.startsWith(`/${devPath}`)) {
        return;
      }

      const specifier = id.slice(devPath.length + 1);

      // `this.resolve` gives the pre-bundled dep, so ask the optimizer for the source it bundled instead.
      const optimized = server.environments.client.depsOptimizer?.metadata.optimized[specifier];
      const resolved = optimized?.src ?? (await this.resolve(specifier))?.id;
      if (!resolved) {
        this.error(`Cannot resolve ${specifier}`);
      }

      return facade(specifier, resolved.split('?')[0]);
    },
  };
}

/** Generates the code of a facade module that re-exports everything from `specifier`, whose source is `file`. */
async function facade(specifier: string, file: string): Promise<string> {
  const quoted = JSON.stringify(specifier);

  // Workspace packages are TypeScript source, which es-module-lexer can't lex once it contains JSX.
  const source = readFileSync(file, 'utf8');
  const code = /\.[cm]?tsx?$/.test(file) ? (await transformWithOxc(source, file)).code : source;
  await init();
  const [, exports, , hasModuleSyntax] = parse(code);
  if (hasModuleSyntax) {
    const hasDefault = exports.some((e) => e.type !== 'reexport-all' && e.name === 'default');
    return `export * from ${quoted};${hasDefault ? ` export { default } from ${quoted};` : ''}\n`;
  }

  // CommonJS, e.g. React: list the names `export *` can't find.
  const names = Object.keys(createRequire(file)(file)).filter(
    (name) => name !== 'default' && /^[A-Za-z_$][\w$]*$/.test(name),
  );
  return `import cjs from ${quoted};\nexport default cjs;\nexport const { ${names.join(', ')} } = cjs;\n`;
}
