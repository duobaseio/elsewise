import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@elsewise/components/components/select';
import { Page, Row } from '@elsewise/components/components/settings';
import type { CloseActivation, FrontendSettings, SettingsSearchTerm } from '@elsewise/frontend-plugin';
import { createFileRoute } from '@tanstack/react-router';
import { useSettings, useUpdateSettingsSection } from '@/settings/settings';

export const Route = createFileRoute('/settings/local/workspace/')({ component: Workspace });

export const WORKSPACE_TERMS = {
  closeActivation: {
    label: 'Tab after close',
    keywords: ['close', 'tab', 'neighbour', 'left', 'right', 'recent', 'activate', 'focus'],
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
    </Page>
  );
}
