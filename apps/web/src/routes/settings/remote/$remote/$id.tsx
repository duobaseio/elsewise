import { DEFAULT_ROUTES } from '@elsewise/plugin';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useSettingsPanels } from '@/settings/settings-panel-manager';
import { PanelError } from '../../-panel-error';

export const Route = createFileRoute('/settings/remote/$remote/$id')({
  component: RemotePanel,
  errorComponent: PanelError,
});

function RemotePanel() {
  const { remote, id } = Route.useParams();
  const panel = useSettingsPanels((settings) => settings.panels.find((panel) => panel.id === id));
  if (panel?.scope !== 'remote') {
    return <Navigate replace to={DEFAULT_ROUTES.settings.general} />;
  }

  return <panel.component id={remote} />;
}
