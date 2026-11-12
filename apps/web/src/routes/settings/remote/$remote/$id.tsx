import { DEFAULT_ROUTES } from '@elsewise/frontend-plugin';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { Suspense } from 'react';
import { useSettingsPanels } from '@/settings/settings-panel-manager';
import { PanelError } from '../../-panel-error';

export const Route = createFileRoute('/settings/remote/$remote/$id')({
  component: RemotePanel,
  errorComponent: PanelError,
});

function RemotePanel() {
  const { remote, id } = Route.useParams();
  const panel = useSettingsPanels((settings) => settings.remotePanels.find((panel) => panel.id === id));
  if (panel === undefined) {
    return <Navigate replace to={DEFAULT_ROUTES.settings.appearance} />;
  }

  return (
    <Suspense>
      <panel.component id={remote} />
    </Suspense>
  );
}
