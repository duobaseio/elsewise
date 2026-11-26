import type { ComponentProps } from 'react';
import { Fragment } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { DockTabHeader } from '../../../src/components/dock';
import { FileIcon } from '../../../src/components/file-icon';
import { StatusIndicator } from '../../../src/components/status-indicator';

import { type ForcedPseudoClass, forcePseudoStates, Sheet, THEMES } from '../../sheet';

type HeaderSpec = { key: string; label: string; props?: Partial<ComponentProps<typeof DockTabHeader>> };

const TABS = [
  { key: 'tab', className: 'dv-tab' },
  { key: 'active', className: 'dv-tab dv-active-tab' },
] as const;
const DOT = <span className="size-2 rounded-full bg-current" />;
const HEADERS = [
  { key: 'plain', label: 'title' },
  { key: 'icon', label: 'icon', props: { icon: <FileIcon name="main.ts" /> } },
  { key: 'dot', label: 'status', props: { status: DOT } },
  { key: 'indicator', label: 'indicator', props: { status: <StatusIndicator status="complete" /> } },
  { key: 'unclosable', label: 'no close', props: { onClose: undefined } },
  { key: 'unclosable-dot', label: 'no close, status', props: { onClose: undefined, status: DOT } },
] as const satisfies readonly HeaderSpec[];

test.each(THEMES)('dock tab header (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <HeaderMatrix headers={HEADERS} />
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`dock-tab-header-${theme}`);
});

test.each(THEMES)('dock tab header pseudo states (%s)', async (theme) => {
  const states: readonly { spec: HeaderSpec; forced: Readonly<Record<string, readonly ForcedPseudoClass[]>> }[] = [
    { spec: { key: 'hover', label: 'tab hover' }, forced: { '.dv-tab': ['hover'] } },
    {
      spec: { key: 'hover-dot', label: 'tab hover, status', props: { status: DOT } },
      forced: { '.dv-tab': ['hover'] },
    },
    { spec: { key: 'close-hover', label: 'close hover' }, forced: { '.dv-tab': ['hover'], button: ['hover'] } },
    { spec: { key: 'close-focus', label: 'close focus-visible' }, forced: { button: ['focus', 'focus-visible'] } },
    {
      spec: { key: 'close-focus-dot', label: 'close focus-visible, status', props: { status: DOT } },
      forced: { button: ['focus', 'focus-visible'] },
    },
  ];

  await render(
    <Sheet theme={theme}>
      <HeaderMatrix headers={states.map(({ spec }) => spec)} />
    </Sheet>,
  );

  await forcePseudoStates(
    states.flatMap(({ spec, forced }) =>
      TABS.flatMap((tab) =>
        Object.entries(forced).map(([selector, pseudoClasses]) => ({
          selector: `[data-testid="cell-${tab.key}-${spec.key}"] ${selector}`,
          pseudoClasses,
        })),
      ),
    ),
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`dock-tab-header-pseudo-${theme}`);
});

/**
 * Tabs down, headers across. Each header sits in an element with a dock tab's classes and height.
 */
function HeaderMatrix({ headers }: { headers: readonly HeaderSpec[] }) {
  return (
    <div
      className="grid w-max items-center gap-x-5 gap-y-2"
      style={{ gridTemplateColumns: `max-content repeat(${headers.length}, max-content)` }}
    >
      <div />
      {headers.map((header) => (
        <div className="text-muted-foreground text-xs" key={header.key}>
          {header.label}
        </div>
      ))}
      {TABS.map((tab) => (
        <Fragment key={tab.key}>
          <div className="text-muted-foreground text-xs">{tab.key}</div>
          {headers.map((header) => (
            <div className="p-1.5" data-testid={`cell-${tab.key}-${header.key}`} key={header.key}>
              <div className={`${tab.className} h-[calc(var(--text-base--line-height)+12px)] w-max`}>
                <DockTabHeader onClose={() => {}} title="main.ts" {...header.props} />
              </div>
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
}
