import { BundledTheme } from '@elsewise/bridge';
import { Button } from '@elsewise/components/components/button';
import { Icon } from '@elsewise/components/components/icon';
import { Kbd } from '@elsewise/components/components/kbd';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@elsewise/components/components/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@elsewise/components/components/tooltip';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { type ISplitviewPanelProps, Orientation, SplitviewReact, type SplitviewReadyEvent } from 'dockview-react';
import { THEMES } from '@/appearance/themes';
import { useCommandManager } from '@/command/command-manager';
import { Header } from '@/components/header';
import { OPEN_SETTINGS, useBrightness, useSettings, useUpdateSettings } from '@/settings/settings';

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
  const commands = useCommandManager();
  const key = useCommandManager((commands) => commands.keymap.commands.get(OPEN_SETTINGS.id)?.[0]);

  // TODO: Temporary, switches the theme and brightness to look through them.
  const theme = useSettings((settings) => settings.appearance.general.theme);
  const brightness = useBrightness();
  const update = useUpdateSettings();
  const themes = Object.fromEntries(THEMES.map(({ id, theme }) => [id.name, theme.name]));

  // TODO: Add actual sidebar content.
  return (
    <div className="flex h-full flex-col">
      <Header trafficLights />
      <div className="flex gap-2 p-2">
        <Select
          items={themes}
          value={theme.name}
          onValueChange={(name) =>
            update((settings) => ({
              ...settings,
              appearance: {
                ...settings.appearance,
                general: {
                  ...settings.appearance.general,
                  theme: { source: 'elsewise', name: BundledTheme.parse(name) },
                },
              },
            }))
          }
        >
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(themes).map(([name, label]) => (
              <SelectItem key={name} value={name}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={() =>
            update((settings) => ({
              ...settings,
              appearance: {
                ...settings.appearance,
                general: { ...settings.appearance.general, brightness: brightness === 'dark' ? 'light' : 'dark' },
              },
            }))
          }
          variant="outline"
        >
          {brightness === 'dark' ? 'Dark' : 'Light'}
        </Button>
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={OPEN_SETTINGS.label}
              className="m-2 ml-auto mt-auto text-text-3"
              onClick={() => commands.run(OPEN_SETTINGS.id)}
              size="icon"
              variant="ghost"
            />
          }
        >
          <Icon className="size-5" name="settings" />
        </TooltipTrigger>
        <TooltipContent side="top">
          {OPEN_SETTINGS.label}
          {key !== undefined && <Kbd binding={key} />}
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
