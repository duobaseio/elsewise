import { Button } from '@elsewise/components/components/button';
import { Icon } from '@elsewise/components/components/icon';
import { Kbd } from '@elsewise/components/components/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@elsewise/components/components/tooltip';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { type ISplitviewPanelProps, Orientation, SplitviewReact, type SplitviewReadyEvent } from 'dockview-react';
import { Header } from '@/components/header';

import 'dockview-react/dist/styles/dockview.css';
import './dockview.css';

export const Route = createFileRoute('/_shell')({ component: Shell });

type PanelKind = keyof typeof PANELS;
const PANELS = { sidebar: SidebarPanel, main: MainPanel };

function Shell() {
  const onReady = (event: SplitviewReadyEvent) => {
    event.api.addPanel({
      id: 'main',
      component: 'main' satisfies PanelKind,
      minimumSize: 10,
    });
    event.api.addPanel({
      id: 'sidebar',
      component: 'sidebar' satisfies PanelKind,
      index: 0,
      minimumSize: 80,
      size: 350,
    });
  };

  return (
    <div className="dockview-theme-elsewise h-dvh bg-background text-foreground">
      <SplitviewReact components={PANELS} onReady={onReady} orientation={Orientation.HORIZONTAL} />
    </div>
  );
}

function SidebarPanel(_props: ISplitviewPanelProps) {
  // TODO: Add actual sidebar content.
  return (
    <div className="flex h-full flex-col">
      <Header trafficLights />
      <Tooltip>
        <TooltipTrigger
          render={
            // TODO: Link to the settings once its route exists.
            <Button aria-label="Settings" className="m-2 ml-auto mt-auto text-text-3" size="icon" variant="ghost" />
          }
        >
          <Icon className="size-5" name="settings" />
        </TooltipTrigger>
        <TooltipContent side="top">
          Settings
          <Kbd binding="Mod-," />
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function MainPanel(_props: ISplitviewPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <Header className="border-border border-b" />
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
