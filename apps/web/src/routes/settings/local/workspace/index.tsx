import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@elsewise/components/components/select';
import { Separator } from '@elsewise/components/components/separator';
import { Page, Row } from '@elsewise/components/components/settings';
import { Switch } from '@elsewise/components/components/switch';
import type { CloseActivation, FrontendSettings, SettingsSearchTerm } from '@elsewise/frontend-plugin';
import { createFileRoute } from '@tanstack/react-router';
import { useSettings, useUpdateSettingsSection } from '@/settings/settings';
import { TabTooltipsHelp } from './-help';

export const Route = createFileRoute('/settings/local/workspace/')({ component: Workspace });

export const WORKSPACE_TERMS = {
  closeActivation: {
    label: 'Tab after close',
    keywords: ['close', 'tab', 'neighbour', 'left', 'right', 'recent', 'activate', 'focus'],
  },
  tabTooltips: {
    label: 'Tab tooltips',
    keywords: ['tooltip', 'hover', 'tab', 'path', 'name', 'hint'],
  },
  markModifiedTabs: {
    label: 'Mark modified tabs',
    keywords: ['unsaved', 'dirty', 'dot', 'tab', 'changes', 'indicator'],
  },
} as const satisfies Record<keyof FrontendSettings['workspace'], SettingsSearchTerm>;

const CLOSE_ACTIVATIONS: Record<CloseActivation, string> = {
  left: 'Tab on the left',
  right: 'Tab on the right',
  recent: 'Most recent tab',
};

export function Workspace() {
  const workspace = useSettings((settings) => settings.workspace);
  const set = useUpdateSettingsSection('workspace');

  return (
    <Page title="Workspace">
      <Row
        id="closeActivation"
        label={WORKSPACE_TERMS.closeActivation.label}
        description="The tab shown after closing the current tab."
      >
        <Select
          items={CLOSE_ACTIVATIONS}
          onValueChange={(closeActivation) => {
            if (closeActivation) {
              set({ closeActivation });
            }
          }}
          value={workspace.closeActivation}
        >
          <SelectTrigger aria-label={WORKSPACE_TERMS.closeActivation.label} autoWidth size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CLOSE_ACTIVATIONS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      <Row
        id="tabTooltips"
        label={WORKSPACE_TERMS.tabTooltips.label}
        description="Show a tooltip when hovering over a tab."
        help={<TabTooltipsHelp enabled={workspace.tabTooltips} />}
      >
        <Switch
          aria-label={WORKSPACE_TERMS.tabTooltips.label}
          checked={workspace.tabTooltips}
          onCheckedChange={(tabTooltips) => set({ tabTooltips })}
        />
      </Row>

      <Separator />

      <Row
        id="markModifiedTabs"
        label={WORKSPACE_TERMS.markModifiedTabs.label}
        description="Mark file tabs with unsaved changes."
      >
        <Switch
          aria-label={WORKSPACE_TERMS.markModifiedTabs.label}
          checked={workspace.markModifiedTabs}
          onCheckedChange={(markModifiedTabs) => set({ markModifiedTabs })}
        />
      </Row>
    </Page>
  );
}
