import { ArrowUpIcon } from '@phosphor-icons/react';
import { Fragment, type ReactNode } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { Kbd, KbdGroup } from '../../src/components/kbd';
import type { Os } from '../../src/lib/os';

import { Sheet, THEMES } from '../sheet.tsx';

// Contents and grounds, not states — a Kbd is `pointer-events-none` and
// `select-none`, so it has no interactive states to matrix. What varies is what
// sits inside it and what it sits on.
const CONTENTS: readonly { key: string; label: string; render: ReactNode }[] = [
  { key: 'letter', label: 'letter', render: <Kbd>R</Kbd> },
  { key: 'symbol', label: 'symbol', render: <Kbd>⌘</Kbd> },
  { key: 'word', label: 'word', render: <Kbd>Esc</Kbd> },
  { key: 'long', label: 'long word', render: <Kbd>Shift</Kbd> },
  {
    key: 'icon',
    label: 'icon',
    render: (
      <Kbd>
        <ArrowUpIcon />
      </Kbd>
    ),
  },
  {
    key: 'group',
    label: 'group',
    render: (
      <KbdGroup>
        <Kbd>⇧</Kbd>
        <Kbd>⌘</Kbd>
        <Kbd>R</Kbd>
      </KbdGroup>
    ),
  },
];

// The fill is `bg-muted`, and `--muted` resolves to `--surface-2`. These are the
// grounds that decides whether a keycap has an edge at all.
const GROUNDS: readonly { key: string; label: string; className: string }[] = [
  { key: 'background', label: 'on background', className: 'bg-background' },
  { key: 'surface', label: 'on surface', className: 'bg-surface' },
  { key: 'surface-2', label: 'on surface-2', className: 'bg-surface-2' },
  { key: 'popover', label: 'on popover', className: 'bg-popover' },
];

const BINDINGS = ['Mod-Alt-f', 'Shift-Enter', 'Escape', 'Ctrl-Shift-ArrowUp'] as const;

const PLATFORMS: readonly Os[] = ['mac', 'windows', 'linux'];

test.each(THEMES)('kbd contents (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <div className="grid w-max grid-cols-[max-content_max-content] items-center gap-x-8 gap-y-3">
        {CONTENTS.map((content) => (
          <Fragment key={content.key}>
            <div className="text-muted-foreground text-xs">{content.label}</div>
            <div data-testid={`cell-${content.key}`}>{content.render}</div>
          </Fragment>
        ))}
      </div>
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`kbd-contents-${theme}`);
});

test.each(THEMES)('kbd grounds (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <div className="grid w-max grid-cols-[max-content_max-content] items-center gap-x-8 gap-y-3">
        {GROUNDS.map((ground) => (
          <Fragment key={ground.key}>
            <div className="text-muted-foreground text-xs">{ground.label}</div>
            <div className={`rounded-md p-3 ${ground.className}`} data-testid={`ground-${ground.key}`}>
              <KbdGroup>
                <Kbd>⌘</Kbd>
                <Kbd>B</Kbd>
              </KbdGroup>
            </div>
          </Fragment>
        ))}
      </div>
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`kbd-grounds-${theme}`);
});

test.each(THEMES)('kbd shortcuts (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <div
        className="grid w-max items-center gap-x-8 gap-y-3"
        style={{ gridTemplateColumns: `max-content repeat(${PLATFORMS.length}, max-content)` }}
      >
        <div />
        {PLATFORMS.map((os) => (
          <div className="text-muted-foreground text-xs" key={os}>
            {os}
          </div>
        ))}
        {BINDINGS.map((binding) => (
          <Fragment key={binding}>
            <div className="font-mono text-muted-foreground text-xs">{binding}</div>
            {PLATFORMS.map((os) => (
              <Kbd binding={binding} data-testid={`shortcut-${os}-${binding}`} key={os} os={os} />
            ))}
          </Fragment>
        ))}
      </div>
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`kbd-shortcuts-${theme}`);
});
