/**
 * The modules which Elsewise and its plugins must share a single copy of at runtime, e.g. `react`.
 *
 * Plugins should typically declare these modules as peer dependencies.
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
  '@lezer/common',
  '@lezer/highlight',
  'vscode-languageserver-protocol',
] as const;
