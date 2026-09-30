import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { FileIcon, FileIconProvider, type FileIcons } from './file-icon';

const ICONS: FileIcons = {
  names: { 'notes.json': { kind: 'letters', letters: 'N', tint: null } },
  extensions: {
    json: { kind: 'letters', letters: 'J', tint: null },
    ts: { kind: 'letters', letters: 'T', tint: null },
    zon: { kind: 'letters', letters: 'Z', tint: null },
  },
};

function markupOf(name: string, icons?: FileIcons) {
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
