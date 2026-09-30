import { Fragment, type ReactNode } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { Checkbox } from '../../src/components/checkbox';
import { Input } from '../../src/components/input';
import { Label } from '../../src/components/label';

import { Sheet, THEMES } from '../sheet.tsx';

// Three selectors, none covering the others. `peer-disabled:` is real CSS
// `:disabled`, so it reaches the native input but not the Base UI checkbox.
// No field wrapper exists yet — the `group` row is waiting for one.
const CASES: readonly { key: string; label: string; render: ReactNode }[] = [
  { key: 'rest', label: 'rest', render: <Label>Branch name</Label> },
  {
    key: 'peer-input',
    label: 'peer: disabled input',
    render: (
      <div className="flex w-56 flex-col gap-1.5">
        <Input className="peer" defaultValue="feat/passport" disabled />
        <Label>Branch name</Label>
      </div>
    ),
  },
  {
    key: 'peer-checkbox',
    label: 'peer: disabled checkbox',
    render: (
      <div className="flex items-center gap-2">
        <Checkbox aria-label="Stage" defaultChecked disabled />
        <Label>Stage all changes</Label>
      </div>
    ),
  },
  {
    key: 'group',
    label: 'group: data-disabled',
    render: (
      <div className="group flex items-center gap-2" data-disabled="">
        <Checkbox aria-label="Stage" defaultChecked />
        <Label>Stage all changes</Label>
      </div>
    ),
  },
];

test.each(THEMES)('label disabled sources (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <div className="grid w-max grid-cols-[max-content_max-content] items-center gap-x-8 gap-y-4">
        {CASES.map((testCase) => (
          <Fragment key={testCase.key}>
            <div className="text-muted-foreground text-xs">{testCase.label}</div>
            <div data-testid={`cell-${testCase.key}`}>{testCase.render}</div>
          </Fragment>
        ))}
      </div>
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`label-${theme}`);
});
