import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { Button } from '@elsewise/components/components/button';
import { Collapsible, CollapsibleContent } from '@elsewise/components/components/collapsible';
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@elsewise/components/components/combobox';
import { Icon } from '@elsewise/components/components/icon';
import { HighlightProvider } from '@elsewise/components/components/settings';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuChevron,
  SidebarMenuItem,
  SidebarMenuRow,
  SidebarMenuRowLabel,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
} from '@elsewise/components/components/sidebar';
import { DEFAULT_ROUTES } from '@elsewise/frontend-plugin';
import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
  useMatchRoute,
  useNavigate,
  useParams,
  useRouter,
} from '@tanstack/react-router';
import { type ReactNode, useEffect, useState } from 'react';
import { Header } from '@/components/header';
import { useEditorManager } from '@/editor/editor-manager';
import { DEFAULT_PANELS, linkTo } from '@/settings/default-panels';
import { LANGUAGES } from '@/settings/languages';
import { useSettings, useUpdateSettings } from '@/settings/settings';
import { useSettingsPanels } from '@/settings/settings-panel-manager';
import { PAGE } from './index';
import { Search } from './local/-search';

export const Route = createFileRoute('/settings')({
  component: Settings,
  validateSearch: (search: Record<string, unknown>): { highlight?: string } => ({
    highlight: typeof search.highlight === 'string' ? search.highlight : undefined,
  }),
});

const MODIFIERS = ['Shift', 'Meta', 'Control', 'Alt'];

function Settings() {
  const router = useRouter();
  const navigate = Route.useNavigate();
  const { remote } = useParams({ strict: false });
  const panels = useSettingsPanels((settings) => (remote === undefined ? settings.localPanels : settings.remotePanels));
  const languages = useSettings((settings) => Object.keys(settings.appearance.editor.languages));
  const { highlight } = Route.useSearch();
  const pathname = useLocation({ select: (location) => location.pathname });

  useEffect(() => {
    if (pathname.startsWith('/settings/')) {
      try {
        localStorage.setItem(PAGE, pathname);
      } catch (error) {
        console.warn('settings: could not save the last page', error);
      }
    }
  }, [pathname]);

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
            className="ml-auto cursor-default text-text-3 [-webkit-app-region:no-drag]"
            onClick={() =>
              router.history.canGoBack() ? router.history.back() : router.navigate({ to: DEFAULT_ROUTES.home })
            }
            size="sm"
            variant="ghost"
          >
            <Icon data-icon="inline-start" name="back" />
            Back
          </Button>
        </Header>
        <Search />

        <SidebarContent selectionFollowsFocus>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {panels
                  .filter((panel) => panel.in === undefined)
                  .map((panel) =>
                    panel.id === DEFAULT_PANELS.editor.id ? (
                      <Item
                        entries={languages
                          .map((language) => ({
                            key: language,
                            label: LANGUAGES[language]?.label ?? language,
                            link: linkTo(panel, { language }),
                          }))
                          .sort((a, b) => a.label.localeCompare(b.label))}
                        key={panel.id}
                        label={panel.label}
                        action={<AddLanguage languages={languages} />}
                        link={linkTo(panel, { remote })}
                      />
                    ) : (
                      <Item
                        entries={panels
                          .filter((other) => other.in === panel.id)
                          .map((other) => ({ key: other.id, label: other.label, link: linkTo(other, { remote }) }))}
                        key={panel.id}
                        label={panel.label}
                        link={linkTo(panel, { remote })}
                      />
                    ),
                  )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="min-h-0 flex-1 overflow-y-auto [container-type:size]">
          <HighlightProvider id={highlight}>
            <Outlet />
          </HighlightProvider>
        </main>
      </div>
    </SidebarProvider>
  );
}

type Entry = { key: string; label: string; link: ReturnType<typeof linkTo> };

function Item({
  label,
  link,
  entries,
  action,
}: {
  label: string;
  link: ReturnType<typeof linkTo>;
  entries: readonly Entry[];
  action?: ReactNode;
}) {
  const matchRoute = useMatchRoute();
  const active = Boolean(matchRoute(link));
  const activeInside = entries.some((entry) => matchRoute(entry.link));
  const [open, setOpen] = useState(active || activeInside);

  // Opening a page inside, e.g. from a search result, shows it.
  useEffect(() => {
    if (activeInside) {
      setOpen(true);
    }
  }, [activeInside]);

  if (entries.length === 0 && action === undefined) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          className="cursor-default"
          isActive={active}
          render={<Link draggable={false} replace {...link} />}
        >
          {label}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible onOpenChange={setOpen} open={open} render={<SidebarMenuItem />}>
      <SidebarMenuRow isActive={active}>
        <SidebarMenuRowLabel
          aria-expanded={open}
          className="select-none"
          data-active={active ? '' : undefined}
          onDoubleClick={() => setOpen((open) => !open)}
          render={<Link draggable={false} replace {...link} />}
        >
          {label}
        </SidebarMenuRowLabel>
        <SidebarMenuChevron />
      </SidebarMenuRow>
      <CollapsibleContent>
        <SidebarMenuSub>
          {entries.map((entry) => (
            <SidebarMenuSubItem key={entry.key}>
              <SidebarMenuSubButton
                className="cursor-default"
                isActive={Boolean(matchRoute(entry.link))}
                render={<Link draggable={false} replace {...entry.link} />}
                size="sm"
              >
                <span>{entry.label}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
          {action}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AddLanguage({ languages }: { languages: readonly string[] }) {
  const update = useUpdateSettings();
  const navigate = useNavigate();
  const known = useEditorManager((editor) => editor.languages.languages);
  // Some languages, e.g. JS & JSX, share the same settings page.
  const remaining = [...new Set(known.map((language) => LANGUAGES[language.name]?.name ?? language.name))]
    .filter((name) => !languages.includes(name))
    .sort((a, b) => a.localeCompare(b));

  return (
    <SidebarMenuSubItem>
      <Combobox
        items={remaining}
        onValueChange={(language: string | null) => {
          if (language === null) {
            return;
          }
          update((settings) => ({
            ...settings,
            appearance: {
              ...settings.appearance,
              editor: {
                ...settings.appearance.editor,
                languages: { ...settings.appearance.editor.languages, [language]: {} },
              },
            },
          }));
          void navigate({ ...linkTo(DEFAULT_PANELS.editor, { language }), replace: true });
        }}
        value={null}
      >
        <ComboboxPrimitive.Trigger
          aria-label="Add language"
          // The arrows move between the sidebar's rows rather than open the list.
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventBaseUIHandler();
            }
          }}
          render={
            <SidebarMenuSubButton
              className="w-full cursor-default text-text-2 [&>svg]:size-2.75"
              render={<button type="button" />}
              size="sm"
            />
          }
        >
          <Icon name="add" />
          <span>Add language</span>
        </ComboboxPrimitive.Trigger>
        <ComboboxContent align="start" className="w-64">
          <ComboboxInput placeholder="Search languages" />
          <ComboboxEmpty>No languages found</ComboboxEmpty>
          <ComboboxList>
            <ComboboxCollection>
              {(name: string) => (
                <ComboboxItem key={name} value={name}>
                  {LANGUAGES[name]?.label ?? name}
                </ComboboxItem>
              )}
            </ComboboxCollection>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </SidebarMenuSubItem>
  );
}
