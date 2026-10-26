import { DEFAULT_ROUTES } from '@elsewise/plugin';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useSettingsPanels } from '@/settings/settings-panel-manager';

export const Route = createFileRoute('/settings/plugins/$id')({ component: PluginPanel, errorComponent: PanelError });

function PluginPanel() {
  const { id } = Route.useParams();
  const panel = useSettingsPanels((settings) => settings.panels.find((panel) => panel.id === id));
  if (panel === undefined) {
    return <Navigate replace to={DEFAULT_ROUTES.settings.general} />;
  }

  return <panel.component />;
}

export function PanelError({ error }: { error: unknown }) {
  return (
    <div className="flex max-w-3xl flex-col gap-8 p-8">
      <h1 className="text-heading-lg">Could not show these settings</h1>
      <p className="text-sm text-text-2">{error instanceof Error ? error.message : String(error)}</p>
    </div>
  );
}
