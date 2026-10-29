import { DEFAULT_ROUTES } from '@elsewise/plugin';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useSettingsPanels } from '@/settings/settings-panel-manager';
import { PanelError } from '../-panel-error';

export const Route = createFileRoute('/settings/local/$id')({ component: LocalPanel, errorComponent: PanelError });

function LocalPanel() {
  const { id } = Route.useParams();
  const panel = useSettingsPanels((settings) => settings.localPanels.find((panel) => panel.id === id));
  if (panel === undefined) {
    return <Navigate replace to={DEFAULT_ROUTES.settings.general} />;
  }

  return <panel.component />;
}
