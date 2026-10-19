import type { LSPClientExtension } from '@codemirror/lsp-client';
import type { LanguageServer } from '@elsewise/plugin';
import type { ConfigurationParams } from 'vscode-languageserver-protocol';

/**
 * Returns the client extension that tells the server it can ask for its settings.
 */
export function serverConfiguration(): LSPClientExtension {
  return { clientCapabilities: { workspace: { configuration: true } } };
}

/**
 * Returns each section of `settings` that the server asks for, or null if there is none.
 */
export function configuration(settings: LanguageServer['settings'], { items }: ConfigurationParams): unknown[] {
  return items.map(({ section }) => {
    let value: unknown = settings;
    for (const key of section ? section.split('.') : []) {
      value =
        typeof value === 'object' && value !== null && Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined;
    }
    return value ?? null;
  });
}
