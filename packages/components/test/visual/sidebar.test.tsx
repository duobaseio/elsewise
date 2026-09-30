import { DotsThreeIcon, GitBranchIcon, PlusIcon } from '@phosphor-icons/react';
import type { ComponentProps } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
} from '../../src/components/sidebar';

import { type ForcedPseudoClass, forcePseudoStates, Sheet, THEMES } from '../sheet.tsx';

type RowSpec = {
  key: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  badge?: string;
  forced?: readonly ForcedPseudoClass[];
};

const ROWS: readonly RowSpec[] = [
  { key: 'rest', label: 'rest' },
  // No pressed cell: rows carry no press layer, so it would only re-shoot hover.
  { key: 'hover', label: 'hover', forced: ['hover'] },
  {
    key: 'focus-visible',
    label: 'focus-visible',
    forced: ['focus', 'focus-visible'],
  },
  { key: 'active', label: 'selected', active: true },
  // Hover over the selected row is where the two layers had to stop being the
  // same color; it earns a cell of its own.
  {
    key: 'active-hover',
    label: 'selected + hover',
    active: true,
    forced: ['hover'],
  },
  { key: 'badge', label: 'with badge', badge: '3' },
  { key: 'disabled', label: 'disabled', disabled: true },
];

// Ragged on purpose — the widths used to be rolled per mount.
const SKELETONS = ['82%', '54%', '68%'] as const;

test.each(THEMES)('sidebar (%s)', async (theme) => {
  await render(<SidebarSheet theme={theme} />);

  await forcePseudoStates(
    ROWS.filter((row) => row.forced).map((row) => ({
      selector: `[data-visual-state="${row.key}"]`,
      pseudoClasses: row.forced ?? [],
    })),
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`sidebar-${theme}`);
});

function SidebarSheet({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <Sheet theme={theme}>
      <SidebarProvider className="min-h-0 w-64">
        <Sidebar collapsible="none">
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Worktrees</SidebarGroupLabel>
              <SidebarGroupAction data-visual-state="group-action">
                <PlusIcon />
              </SidebarGroupAction>
              <SidebarGroupContent>
                <SidebarMenu>
                  {ROWS.map((row) => (
                    <SidebarMenuItem key={row.key}>
                      <SidebarMenuButton data-visual-state={row.key} disabled={row.disabled} isActive={row.active}>
                        <GitBranchIcon />
                        <span>{row.label}</span>
                      </SidebarMenuButton>
                      {row.badge && <SidebarMenuBadge>{row.badge}</SidebarMenuBadge>}
                    </SidebarMenuItem>
                  ))}
                  <SidebarMenuItem>
                    <SidebarMenuButton>
                      <GitBranchIcon />
                      <span>with action</span>
                    </SidebarMenuButton>
                    <SidebarMenuAction>
                      <DotsThreeIcon />
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Nested</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton>
                      <GitBranchIcon />
                      <span>main</span>
                    </SidebarMenuButton>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton>sub rest</SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton isActive>sub selected</SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton size="sm">sub sm</SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Loading</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {SKELETONS.map((width) => (
                    <SidebarMenuItem key={width}>
                      <SidebarMenuSkeleton showIcon width={width} />
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    </Sheet>
  );
}

type LayoutSpec = {
  key: string;
  label: string;
  open: boolean;
  sidebar: Pick<ComponentProps<typeof Sidebar>, 'collapsible' | 'side' | 'variant'>;
  railHover?: boolean;
};

const LAYOUTS: readonly LayoutSpec[] = [
  { key: 'expanded', label: 'sidebar', open: true, sidebar: {} },
  { key: 'icon', label: 'sidebar · icon', open: false, sidebar: { collapsible: 'icon' } },
  { key: 'offcanvas', label: 'sidebar · offcanvas + rail hover', open: false, sidebar: {}, railHover: true },
  { key: 'rail-hover', label: 'sidebar · rail hover', open: true, sidebar: {}, railHover: true },
  { key: 'right', label: 'sidebar · right', open: true, sidebar: { side: 'right' } },
  { key: 'right-icon', label: 'sidebar · right · icon', open: false, sidebar: { side: 'right', collapsible: 'icon' } },
  { key: 'floating', label: 'floating', open: true, sidebar: { variant: 'floating' } },
  {
    key: 'floating-icon',
    label: 'floating · icon',
    open: false,
    sidebar: { variant: 'floating', collapsible: 'icon' },
  },
  { key: 'inset', label: 'inset', open: true, sidebar: { variant: 'inset' } },
  { key: 'inset-icon', label: 'inset · icon', open: false, sidebar: { variant: 'inset', collapsible: 'icon' } },
];

test.each(THEMES)('sidebar layouts (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <div className="grid w-max grid-cols-3 gap-x-5 gap-y-3">
        {LAYOUTS.map((layout) => (
          <div className="flex flex-col gap-1" key={layout.key}>
            <div className="text-muted-foreground text-xs">{layout.label}</div>
            <LayoutFrame layout={layout} />
          </div>
        ))}
      </div>
    </Sheet>,
  );

  await forcePseudoStates(
    LAYOUTS.filter((layout) => layout.railHover).map((layout) => ({
      selector: `[data-testid="layout-${layout.key}"] [data-slot="sidebar-rail"]`,
      pseudoClasses: ['hover'],
    })),
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`sidebar-layouts-${theme}`);
});

function LayoutFrame({ layout }: { layout: LayoutSpec }) {
  const inset = (
    <SidebarInset>
      <div className="p-3 text-muted-foreground text-xs">inset</div>
    </SidebarInset>
  );
  const right = layout.sidebar.side === 'right';

  return (
    // The sidebar container is `fixed`; layout containment makes the frame its containing block, and paint containment
    // clips the offcanvas state to the frame instead of letting it land elsewhere on the sheet.
    <div
      className="h-44 w-96 border border-border"
      data-testid={`layout-${layout.key}`}
      style={{ contain: 'layout paint' }}
    >
      <SidebarProvider className="h-full min-h-0" defaultOpen={layout.open}>
        {right && inset}
        <Sidebar {...layout.sidebar}>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Worktrees</SidebarGroupLabel>
              <SidebarGroupAction>
                <PlusIcon />
              </SidebarGroupAction>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive>
                      <GitBranchIcon />
                      <span>main</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton>
                      <GitBranchIcon />
                      <span>develop</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>3</SidebarMenuBadge>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton>
                      <GitBranchIcon />
                      <span>feat/passport</span>
                    </SidebarMenuButton>
                    <SidebarMenuAction>
                      <DotsThreeIcon />
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarRail />
        </Sidebar>
        {!right && inset}
      </SidebarProvider>
    </div>
  );
}
