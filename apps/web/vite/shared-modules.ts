import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { init, parse } from 'es-module-lexer';
import { type Plugin, type ResolvedConfig, transformWithOxc } from 'vite';

/** The id prefix of a shared module's facade, e.g. `\0shared:react`. */
const VIRTUAL = '\0shared:';

/** The path under `base` that the dev server serves a shared module's facade at, e.g. `/@shared/react`. */
const DEV_PATH = '@shared/';

/**
 * A Vite plugin that lets plugins Elsewise loads at runtime share the app's own instances of `specifiers`. A plugin is
 * built separately and leaves those modules external, so without this it would need its own copy of e.g. React, and
 * two Reacts break hooks and context.
 *
 * It injects an import map into `index.html` that points each specifier at a facade re-exporting the app's instance:
 * `export *` for an ES module, plus its default export if it has one. `export *` finds no names in CommonJS, e.g.
 * React, so that facade lists them, read by requiring the package in Node. Node picks the build matching `NODE_ENV`,
 * as Vite does.
 *
 * - **build**: Vite turns off `preserveEntrySignatures` for apps, so each facade is emitted as its own entry chunk that
 *   opts back in. Rolldown moves the library into a chunk the facade shares with the app's entry, so there is one
 *   instance, and the import map points at the facade's hashed file.
 * - **dev**: The import map points at a stable `<base>@shared/<specifier>` URL serving the facade, whose import Vite
 *   rewrites to the same pre-bundled dep the app imports. It doesn't point straight at `.vite/deps`, where a CommonJS
 *   dep only has a default export. The specifiers are also pre-bundled up front, so a plugin importing one the app
 *   doesn't never triggers a re-optimize and full reload.
 */
export function sharedModules(specifiers: readonly string[]): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'shared-modules',

    config(userConfig) {
      // Linked workspace packages are served from source; pre-bundling one would lose its HMR.
      const root = path.resolve(userConfig.root ?? '');
      const include = specifiers.filter((specifier) => {
        const name = specifier.split('/', specifier.startsWith('@') ? 2 : 1).join('/');
        return realpathSync(path.join(root, 'node_modules', name)).includes(`${path.sep}node_modules${path.sep}`);
      });
      return { optimizeDeps: { include } };
    },

    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },

    buildStart() {
      if (config.command !== 'build') return;
      for (const specifier of specifiers) {
        this.emitFile({
          type: 'chunk',
          id: VIRTUAL + specifier,
          name: `shared/${specifier.replace(/^@/, '')}`,
          preserveSignature: 'strict',
        });
      }
    },

    resolveId(id) {
      if (id.startsWith(VIRTUAL)) return id;
      // The dev server strips `base` from the import map's URLs.
      if (id.startsWith(`/${DEV_PATH}`)) return VIRTUAL + id.slice(DEV_PATH.length + 1);
    },

    async load(id) {
      if (!id.startsWith(VIRTUAL)) return;
      const specifier = id.slice(VIRTUAL.length);
      const quoted = JSON.stringify(specifier);

      // In dev, `this.resolve` gives the pre-bundled dep, so ask the optimizer for the source it bundled instead.
      const resolved =
        (this.environment.mode === 'dev' && this.environment.depsOptimizer?.metadata.optimized[specifier]?.src) ||
        (await this.resolve(specifier))?.id;
      if (!resolved) this.error(`Cannot resolve ${specifier}`);
      const file = resolved.split('?')[0];

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
    },

    transformIndexHtml: {
      order: 'post',
      handler(_html, { bundle }) {
        const imports: Record<string, string> = {};
        for (const specifier of specifiers) {
          if (!bundle) {
            imports[specifier] = config.base + DEV_PATH + specifier;
            continue;
          }
          const chunk = Object.values(bundle).find(
            (output) => output.type === 'chunk' && output.facadeModuleId === VIRTUAL + specifier,
          );
          if (!chunk) throw new Error(`No chunk for shared module ${specifier}`);
          imports[specifier] = config.base + chunk.fileName;
        }
        // The import map must precede the module scripts and modulepreload links that resolve through it.
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
