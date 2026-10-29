import { LanguageDescription } from '@codemirror/language';
import { languages as DEFAULT_LANGUAGES } from '@codemirror/language-data';
import type { LanguageServer } from '@elsewise/plugin';
import { describe, expect, test } from 'vitest';
import { LanguageManager } from '@/editor/language-manager';

// Returns a language named `name` whose grammar never loads.
function language(name: string): LanguageDescription {
  return LanguageDescription.of({ name, extensions: ['toy'], load: () => new Promise(() => {}) });
}

// Returns a language server with `id` that never starts.
function server(id: string): LanguageServer {
  return { id, name: id, languages: { Toy: 'toy' }, start: () => new Promise(() => {}) };
}

describe('add', () => {
  test('prepends languages until disposed', () => {
    const manager = new LanguageManager(() => {});
    const first = [language('a'), language('b')];
    const second = [language('c')];
    const dispose = manager.add(first);
    manager.add(second);

    expect(manager.languages).toEqual([...second, ...first, ...DEFAULT_LANGUAGES]);

    dispose();

    expect(manager.languages).toEqual([...second, ...DEFAULT_LANGUAGES]);
  });

  test('removes only disposed addition when added twice', () => {
    const manager = new LanguageManager(() => {});
    const languages = [language('a')];
    const dispose = manager.add(languages);
    manager.add(languages);
    dispose();

    expect(manager.languages).toEqual([...languages, ...DEFAULT_LANGUAGES]);
  });
});

describe('addServers', () => {
  test('prepends servers until disposed', () => {
    const manager = new LanguageManager(() => {});
    const first = [server('a'), server('b')];
    const second = [server('c')];
    const dispose = manager.addServers(first);
    manager.addServers(second);

    expect(manager.servers).toEqual([...second, ...first]);

    dispose();

    expect(manager.servers).toEqual(second);
  });

  test('removes only disposed addition when added twice', () => {
    const manager = new LanguageManager(() => {});
    const servers = [server('a')];
    const dispose = manager.addServers(servers);
    manager.addServers(servers);
    dispose();

    expect(manager.servers).toEqual(servers);
  });
});
