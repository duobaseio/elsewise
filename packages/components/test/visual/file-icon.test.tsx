import { Fragment } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { FileIcon } from '../../src/components/file-icon';

import { Sheet, THEMES } from '../sheet.tsx';

type IconGroup = { label: string; names: readonly string[] };

test.each(THEMES)('file icon kinds (%s)', async (theme) => {
  const kinds: readonly IconGroup[] = [
    {
      label: 'glyph',
      names: ['main.ts', 'styles.css', 'index.html', 'Dockerfile'],
    },
    {
      label: 'glyph — ink',
      names: ['main.rs', '.editorconfig', 'readme.md', 'main.c'],
    },
    {
      label: 'brand',
      names: ['main.py', 'main.clj', 'main.kts', 'Pipfile'],
    },
    {
      label: 'letters',
      names: ['parser.y', 'Makefile', 'script.awk', 'shader.hlsl'],
    },
    {
      label: 'letters — ink',
      names: ['data.proto', 'notes.txt', 'proof.lean'],
    },
    { label: 'media', names: ['photo.png', 'anim.gif', 'Main.java'] },
    { label: 'fallback', names: ['notes.qqqzzz'] },
  ];

  await render(
    <Sheet theme={theme}>
      <IconMatrix groups={kinds} />
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`file-icon-kinds-${theme}`);
});

test.each(THEMES)('file icon resolution (%s)', async (theme) => {
  const resolution: readonly IconGroup[] = [
    {
      label: 'filename wins',
      names: ['tsconfig.json', 'data.json', 'CMakeLists.txt', 'notes.txt'],
    },
    { label: 'longest suffix', names: ['build.gradle.kts', 'main.kts'] },
    { label: 'shorter suffix', names: ['some.unmapped.ts', 'main.ts'] },
    { label: 'case-sensitive', names: ['MAIN.TS', 'main.ts'] },
    {
      label: 'unmapped',
      names: ['notes.qqqzzz', 'LICENSE-not-a-known-name'],
    },
  ];

  await render(
    <Sheet theme={theme}>
      <IconMatrix groups={resolution} />
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`file-icon-resolution-${theme}`);
});

function IconMatrix({ groups }: { groups: readonly IconGroup[] }) {
  return (
    <div className="grid w-max items-center gap-x-5 gap-y-2" style={{ gridTemplateColumns: 'max-content max-content' }}>
      {groups.map((group) => (
        <Fragment key={group.label}>
          <div className="text-muted-foreground text-xs">{group.label}</div>
          <div className="flex items-center gap-x-4">
            {group.names.map((name) => (
              <span className="flex items-center gap-1.5 text-base" key={name}>
                <FileIcon name={name} />
                {name}
              </span>
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
