import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { FileIcon, FileIconProvider, type FileIcons } from './file-icon';

const ICONS: Partial<FileIcons> = {
  names: { 'notes.json': { kind: 'letters', letters: 'N', tint: null } },
  extensions: {
    json: { kind: 'letters', letters: 'J', tint: null },
    ts: { kind: 'letters', letters: 'T', tint: null },
    zon: { kind: 'letters', letters: 'Z', tint: null },
  },
};

function markupOf(name: string, icons?: Partial<FileIcons>) {
  const icon = <FileIcon name={name} />;
  return renderToStaticMarkup(icons ? <FileIconProvider icons={icons}>{icon}</FileIconProvider> : icon);
}

test.each([
  ['main.ts', 'T'],
  ['data.json', 'J'],
  ['notes.json', 'N'],
  ['main.d.ts', 'T'],
  ['deps.zon', 'Z'],
])('%s draws the replacement', (name, letters) => {
  expect(markupOf(name, ICONS)).toContain(`>${letters}</span>`);
});

test.each(['Dockerfile', 'build.zig.zon', 'main.rs', 'notes.qqqzzz'])('%s keeps its default', (name) => {
  expect(markupOf(name, ICONS)).toBe(markupOf(name));
});

test.each(['constructor', 'toString', '__proto__', 'notes.valueOf'])('%s draws the fallback', (name) => {
  expect(markupOf(name)).toBe(markupOf('notes.qqqzzz'));
});

test.each([
  ['dockerfile', 'Dockerfile'],
  ['DOCKERFILE', 'Dockerfile'],
  ['MAIN.RS', 'main.rs'],
  ['Main.D.TS', 'main.d.ts'],
])('%s draws as %s', (name, canonical) => {
  expect(markupOf(name)).toBe(markupOf(canonical));
  expect(markupOf(name)).not.toBe(markupOf('notes.qqqzzz'));
});

test.each(['Makefile', 'makefile', 'MAKEFILE'])('%s takes an override in any case', (name) => {
  const upper: Partial<FileIcons> = { names: { Makefile: { kind: 'letters', letters: 'XM', tint: null } } };
  const lower: Partial<FileIcons> = { names: { makefile: { kind: 'letters', letters: 'XM', tint: null } } };

  expect(markupOf(name, upper)).toContain('>XM</span>');
  expect(markupOf(name, lower)).toContain('>XM</span>');
});

test('an undefined override keeps the default', () => {
  const icons = { names: { Dockerfile: undefined }, extensions: { rs: undefined } } as unknown as Partial<FileIcons>;

  expect(markupOf('Dockerfile', icons)).toBe(markupOf('Dockerfile'));
  expect(markupOf('main.rs', icons)).toBe(markupOf('main.rs'));
});
