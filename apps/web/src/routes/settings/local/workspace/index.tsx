import { Input } from '@elsewise/components/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@elsewise/components/components/select';
import { Separator } from '@elsewise/components/components/separator';
import { Page, Row } from '@elsewise/components/components/settings';
import { Switch } from '@elsewise/components/components/switch';
import type { CloseActivation, FrontendSettings, SettingsSearchTerm } from '@elsewise/frontend-plugin';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useSettings, useUpdateSettingsSection } from '@/settings/settings';
import { TabTooltipsHelp, UniqueTabNamesHelp } from './-help';

export const Route = createFileRoute('/settings/local/workspace/')({ component: Workspace });

export const WORKSPACE_TERMS = {
  defaultBranchPrefix: {
    label: 'Default branch prefix',
    keywords: ['branch', 'prefix', 'git', 'worktree', 'new', 'name'],
  },
  closeActivation: {
    label: 'Tab after close',
    keywords: ['close', 'tab', 'neighbour', 'left', 'right', 'recent', 'activate', 'focus'],
  },
  tabTooltips: {
    label: 'Tab tooltips',
    keywords: ['tooltip', 'hover', 'tab', 'path', 'name', 'hint'],
  },
  uniqueTabNames: {
    label: 'Unique tab names',
    keywords: ['folder', 'directory', 'path', 'tab', 'name', 'same', 'duplicate', 'prefix'],
  },
  unsavedBadges: {
    label: 'Unsaved badges',
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
  const [defaultBranchPrefix, setDefaultBranchPrefix] = useState(workspace.defaultBranchPrefix);
  const [savedBranchPrefix, setSavedBranchPrefix] = useState(workspace.defaultBranchPrefix);
  if (savedBranchPrefix !== workspace.defaultBranchPrefix) {
    setSavedBranchPrefix(workspace.defaultBranchPrefix);
    setDefaultBranchPrefix(workspace.defaultBranchPrefix);
  }

  return (
    <Page title="Workspace">
      <Row
        id="defaultBranchPrefix"
        label={WORKSPACE_TERMS.defaultBranchPrefix.label}
        description="The default branch prefix for new workspaces."
      >
        <Input
          aria-label={WORKSPACE_TERMS.defaultBranchPrefix.label}
          className="h-7 w-40 rounded-[min(var(--radius-md),12px)] text-sm"
          onChange={(event) => {
            setDefaultBranchPrefix(event.target.value);
            set({ defaultBranchPrefix: event.target.value });
          }}
          placeholder="None"
          spellCheck={false}
          value={defaultBranchPrefix}
        />
      </Row>

      <Separator />

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
        id="uniqueTabNames"
        label={WORKSPACE_TERMS.uniqueTabNames.label}
        description="Distinguish file tabs that share a name by their folders."
        help={<UniqueTabNamesHelp enabled={workspace.uniqueTabNames} />}
      >
        <Switch
          aria-label={WORKSPACE_TERMS.uniqueTabNames.label}
          checked={workspace.uniqueTabNames}
          onCheckedChange={(uniqueTabNames) => set({ uniqueTabNames })}
        />
      </Row>

      <Row
        id="unsavedBadges"
        label={WORKSPACE_TERMS.unsavedBadges.label}
        description="Indicate unsaved file tabs with a badge."
      >
        <Switch
          aria-label={WORKSPACE_TERMS.unsavedBadges.label}
          checked={workspace.unsavedBadges}
          onCheckedChange={(unsavedBadges) => set({ unsavedBadges })}
        />
      </Row>
    </Page>
  );
}
