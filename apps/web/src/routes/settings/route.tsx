import { Button } from '@elsewise/components/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@elsewise/components/components/collapsible';
import { Icon } from '@elsewise/components/components/icon';
import { HighlightProvider } from '@elsewise/components/components/settings';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
} from '@elsewise/components/components/sidebar';
import { DEFAULT_SETTINGS_GROUPS, type SettingsPanel } from '@elsewise/plugin';
import { createFileRoute, Link, Outlet, useMatchRoute, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Header } from '@/components/header';
import { linkTo } from '@/settings/default-panels';
import { useSettingsPanels } from '@/settings/settings-panel-manager';
import { Search } from './-search';

export const Route = createFileRoute('/settings')({
  component: Settings,
  validateSearch: (search: Record<string, unknown>): { highlight?: string } => ({
    highlight: typeof search.highlight === 'string' ? search.highlight : undefined,
  }),
});

const MODIFIERS = ['Shift', 'Meta', 'Control', 'Alt'];

const GROUPS = [
  { id: DEFAULT_SETTINGS_GROUPS.appearance, label: 'Appearance & Behavior' },
  { id: DEFAULT_SETTINGS_GROUPS.plugins, label: 'Plugins' },
];

function Settings() {
  const router = useRouter();
  const navigate = Route.useNavigate();
  const panels = useSettingsPanels((settings) => settings.panels);
  const { highlight } = Route.useSearch();

  // Highlights until user does something.
  useEffect(() => {
    if (highlight === undefined) {
      return;
    }
    const clear = () => navigate({ to: '.', replace: true, search: { highlight: undefined } });
    const onKeyDown = (event: KeyboardEvent) => {
      if (!MODIFIERS.includes(event.key)) {
        clear();
      }
    };
    window.addEventListener('pointerdown', clear);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', clear);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [highlight, navigate]);

  return (
    <SidebarProvider className="h-dvh bg-background text-foreground">
      <Sidebar className="shrink-0 border-border border-r" collapsible="none">
        <Header className="px-2" trafficLights>
          <Button
            className="ml-1 cursor-default text-text-3 [-webkit-app-region:no-drag]"
            onClick={() => (router.history.canGoBack() ? router.history.back() : router.navigate({ to: '/' }))}
            size="sm"
            variant="ghost"
          >
            <Icon data-icon="inline-start" name="back" />
            Back
          </Button>
        </Header>
        <Search />

        <SidebarContent>
          {GROUPS.map((group) => {
            const members = panels.filter((panel) => (panel.in ?? DEFAULT_SETTINGS_GROUPS.plugins) === group.id);
            if (members.length === 0) {
              return null;
            }

            return (
              <SidebarGroup key={group.id}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {members.map((panel) => (
                      <Item key={panel.id} panel={panel} panels={panels.filter((other) => other.in === panel.id)} />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
        </SidebarContent>
      </Sidebar>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <HighlightProvider id={highlight}>
            <Outlet />
          </HighlightProvider>
        </main>
      </div>
    </SidebarProvider>
  );
}

function Item({ panel, panels }: { panel: SettingsPanel; panels: readonly SettingsPanel[] }) {
  const matchRoute = useMatchRoute();
  const link = linkTo(panel);
  const active = Boolean(matchRoute(link));
  const activeInside = panels.some((other) => matchRoute(linkTo(other)));
  const [open, setOpen] = useState(active || activeInside);

  // Opening a panel inside, e.g. from a search result, shows it.
  useEffect(() => {
    if (activeInside) {
      setOpen(true);
    }
  }, [activeInside]);

  if (panels.length === 0) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          className="cursor-default pl-8"
          isActive={active}
          render={<Link draggable={false} replace {...link} />}
        >
          {panel.label}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible onOpenChange={setOpen} open={open} render={<SidebarMenuItem />}>
      <div
        className="flex h-8 items-center gap-2 rounded-md pr-2 pl-2 hover:overlay-hover data-active:bg-layer-selected"
        data-active={active ? '' : undefined}
      >
        <CollapsibleTrigger
          aria-label={open ? `Collapse ${panel.label}` : `Expand ${panel.label}`}
          className="relative flex size-4 shrink-0 cursor-default items-center justify-center rounded-sm text-text-3 outline-none after:absolute after:-inset-2 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
        >
          <Icon
            className={open ? 'size-3.5 transition-transform' : 'size-3.5 -rotate-90 transition-transform'}
            name="expand"
          />
        </CollapsibleTrigger>
        <Link
          className="flex h-full min-w-0 flex-1 cursor-default select-none items-center rounded-md outline-none focus-visible:-outline-offset-1 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
          data-active={active ? '' : undefined}
          draggable={false}
          onDoubleClick={() => setOpen((open) => !open)}
          replace
          {...link}
        >
          {panel.label}
        </Link>
      </div>
      <CollapsibleContent>
        <SidebarMenuSub>
          {panels.map((other) => (
            <SidebarMenuSubItem key={other.id}>
              <SidebarMenuSubButton
                className="cursor-default"
                isActive={Boolean(matchRoute(linkTo(other)))}
                render={<Link draggable={false} replace {...linkTo(other)} />}
                size="sm"
              >
                <span>{other.label}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}
