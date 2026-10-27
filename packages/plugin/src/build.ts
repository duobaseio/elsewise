/**
 * The modules which Elsewise and its plugins must share a single copy of at runtime, e.g. `react`. A specifier ending
 * in `/` covers every module under it, e.g. `@elsewise/components/`.
 *
 * Plugins should typically declare these modules as peer dependencies.
 *
 * See {@link peer} for externalizing them in a bundle.
 */
export const PEER_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@codemirror/autocomplete',
  '@codemirror/commands',
  '@codemirror/language',
  '@codemirror/lint',
  '@codemirror/lsp-client',
  '@codemirror/search',
  '@codemirror/state',
  '@codemirror/view',
  '@elsewise/plugin',
  '@elsewise/components/',
  '@lezer/common',
  '@lezer/highlight',
  'vscode-languageserver-protocol',
] as const;

/**
 * Returns whether `id` is one of the {@link PEER_MODULES}, e.g. for a bundler's `external` option.
 */
export function peer(id: string): boolean {
  return PEER_MODULES.some((specifier) => (specifier.endsWith('/') ? id.startsWith(specifier) : id === specifier));
}
