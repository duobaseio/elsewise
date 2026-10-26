import { Button } from '@elsewise/components/components/button';
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
  SidebarProvider,
} from '@elsewise/components/components/sidebar';
import { DEFAULT_SETTINGS_GROUPS } from '@elsewise/plugin';
import { createFileRoute, Link, Outlet, useMatchRoute, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
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
  const matchRoute = useMatchRoute();
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
            const pages = panels
              .filter((panel) => (panel.group ?? DEFAULT_SETTINGS_GROUPS.plugins) === group.id)
              .map((panel) => ({ ...linkTo(panel), label: panel.label }));
            if (pages.length === 0) {
              return null;
            }

            return (
              <SidebarGroup key={group.id}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {pages.map(({ to, params, label }) => (
                      <SidebarMenuItem key={params?.id ?? to}>
                        <SidebarMenuButton
                          className="cursor-default pl-8"
                          isActive={Boolean(matchRoute({ to, params }))}
                          render={<Link draggable={false} params={params} replace to={to} />}
                        >
                          {label}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
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
