import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './collapsible';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuRow,
  SidebarMenuRowLabel,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubRow,
  SidebarMenuSubRowLabel,
} from './sidebar';

function Menu({ open, label }: { open: boolean; label?: string }) {
  return (
    <SidebarGroup>
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarMenu>
        <Collapsible defaultOpen={open} render={<SidebarMenuItem />}>
          <SidebarMenuRow>
            <SidebarMenuRowLabel render={<CollapsibleTrigger />}>
              <span>project</span>
            </SidebarMenuRowLabel>
          </SidebarMenuRow>
          <CollapsibleContent>
            <SidebarMenuSub>
              <SidebarMenuSubItem>
                <SidebarMenuSubRow>
                  <SidebarMenuSubRowLabel href="#">workspace</SidebarMenuSubRowLabel>
                </SidebarMenuSubRow>
              </SidebarMenuSubItem>
            </SidebarMenuSub>
          </CollapsibleContent>
        </Collapsible>
      </SidebarMenu>
    </SidebarGroup>
  );
}

test('owns sub-menu while expanded', async () => {
  const screen = await render(<Menu label="projects" open />);
  const row = screen.getByRole('treeitem', { name: 'project' });

  await expect.element(row).toHaveAttribute('aria-owns');
  expect(document.getElementById(row.element().getAttribute('aria-owns') ?? '')?.getAttribute('role')).toBe('group');

  await row.click();

  await expect.element(row).not.toHaveAttribute('aria-owns');
});

test('labels menu by group label while there is one', async () => {
  const labelled = await render(<Menu label="projects" open={false} />);
  await expect.element(labelled.getByRole('tree', { name: 'projects' })).toBeInTheDocument();
  labelled.unmount();

  const unlabelled = await render(<Menu open={false} />);

  await expect.element(unlabelled.getByRole('tree')).not.toHaveAttribute('aria-labelledby');
});
