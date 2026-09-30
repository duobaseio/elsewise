import { DotsThreeIcon, GitBranchIcon, PlusIcon } from '@phosphor-icons/react';
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
