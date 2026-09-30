import { HeartIcon, StarIcon } from '@phosphor-icons/react';
import { Fragment, type ReactNode } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { Icon, type IconName, IconProvider } from '../../src/components/icon';

import { Sheet, THEMES } from '../sheet.tsx';

// A record rather than a list, so a role added to `icon.tsx` fails to compile until it is on the sheet.
const ROLES = Object.keys({
  check: true,
  indeterminate: true,
  close: true,
  submenu: true,
  expand: true,
  'scroll-up': true,
  'scroll-down': true,
  search: true,
  success: true,
  info: true,
  warning: true,
  error: true,
  loading: true,
  'sidebar-toggle': true,
  folder: true,
  'folder-open': true,
} as const satisfies Record<IconName, true>) as readonly IconName[];

const PROPS: readonly { key: string; label: string; render: ReactNode }[] = [
  { key: 'default', label: 'default', render: <Icon name="check" /> },
  { key: 'size', label: 'size-6', render: <Icon className="size-6" name="check" /> },
  { key: 'muted', label: 'text-muted-foreground', render: <Icon className="text-muted-foreground" name="check" /> },
  { key: 'destructive', label: 'text-destructive', render: <Icon className="text-destructive" name="error" /> },
  {
    key: 'inherited',
    label: 'inherited',
    render: (
      <span className="text-info text-xl">
        <Icon name="info" />
      </span>
    ),
  },
];

test.each(THEMES)('icon roles (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <div className="grid w-max grid-cols-[max-content_max-content] items-center gap-x-8 gap-y-2">
        {ROLES.map((role) => (
          <Fragment key={role}>
            <div className="text-muted-foreground text-xs">{role}</div>
            <Icon data-testid={`icon-${role}`} name={role} />
          </Fragment>
        ))}
      </div>
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`icon-roles-${theme}`);
});

test.each(THEMES)('icon props (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <div className="grid w-max grid-cols-[max-content_max-content] items-center gap-x-8 gap-y-2">
        {PROPS.map((prop) => (
          <Fragment key={prop.key}>
            <div className="text-muted-foreground text-xs">{prop.label}</div>
            <div data-testid={`cell-${prop.key}`}>{prop.render}</div>
          </Fragment>
        ))}
      </div>
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`icon-props-${theme}`);
});

test.each(THEMES)('icon provider (%s)', async (theme) => {
  const row = (
    <div className="flex items-center gap-x-4">
      <Icon name="check" />
      <Icon name="close" />
      <Icon name="search" />
    </div>
  );

  await render(
    <Sheet theme={theme}>
      <div className="grid w-max grid-cols-[max-content_max-content] items-center gap-x-8 gap-y-2">
        <div className="text-muted-foreground text-xs">no provider</div>
        {row}
        <div className="text-muted-foreground text-xs">check replaced</div>
        <IconProvider icons={{ check: StarIcon }}>{row}</IconProvider>
        <div className="text-muted-foreground text-xs">nested, close replaced</div>
        <IconProvider icons={{ check: StarIcon }}>
          <IconProvider icons={{ close: HeartIcon }}>{row}</IconProvider>
        </IconProvider>
      </div>
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`icon-provider-${theme}`);
});
