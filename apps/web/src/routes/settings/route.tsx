import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { Button } from '@elsewise/components/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@elsewise/components/components/collapsible';
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
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
} from '@elsewise/components/components/sidebar';
import { DEFAULT_SETTINGS_GROUPS } from '@elsewise/plugin';
import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
  useMatchRoute,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import { type ReactNode, useEffect, useState } from 'react';
import { Header } from '@/components/header';
import { useEditorManager } from '@/editor/editor-manager';
import { DEFAULT_PANELS, linkTo } from '@/settings/default-panels';
import { LANGUAGES } from '@/settings/languages';
import { useSettings, useUpdateSettings } from '@/settings/settings';
import { useSettingsPanels } from '@/settings/settings-panel-manager';
import { Search } from './-search';
import { PAGE } from './index';

export const Route = createFileRoute('/settings')({
  component: Settings,
  validateSearch: (search: Record<string, unknown>): { highlight?: string } => ({
    highlight: typeof search.highlight === 'string' ? search.highlight : undefined,
  }),
});

const MODIFIERS = ['Shift', 'Meta', 'Control', 'Alt'];

const GROUPS = [{ id: DEFAULT_SETTINGS_GROUPS.appearance, label: 'Appearance & Behavior' }];

function Settings() {
  const router = useRouter();
  const navigate = Route.useNavigate();
  const panels = useSettingsPanels((settings) => settings.panels);
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
            const members = panels.filter((panel) => panel.in === group.id);
            if (members.length === 0) {
              return null;
            }

            return (
              <SidebarGroup key={group.id}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {members.map((panel) =>
                      panel.id === DEFAULT_PANELS.editor.id ? (
                        <Item
                          entries={languages
                            .map((language) => ({
                              key: language,
                              label: LANGUAGES[language]?.label ?? language,
                              link: linkTo(panel, language),
                            }))
                            .sort((a, b) => a.label.localeCompare(b.label))}
                          key={panel.id}
                          label={panel.label}
                          link={linkTo(panel)}
                        >
                          <AddLanguage languages={languages} />
                        </Item>
                      ) : (
                        <Item
                          entries={panels
                            .filter((other) => other.in === panel.id)
                            .map((other) => ({ key: other.id, label: other.label, link: linkTo(other) }))}
                          key={panel.id}
                          label={panel.label}
                          link={linkTo(panel)}
                        />
                      ),
                    )}
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

type Entry = { key: string; label: string; link: ReturnType<typeof linkTo> };

// A page, and the `entries` under it, with `children` after them.
function Item({
  label,
  link,
  entries,
  children,
}: {
  label: string;
  link: ReturnType<typeof linkTo>;
  entries: readonly Entry[];
  children?: ReactNode;
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

  if (entries.length === 0 && children === undefined) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          className="cursor-default pl-8"
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
      <div
        className="flex h-8 items-center gap-2 rounded-md pr-2 pl-2 hover:overlay-hover data-active:bg-layer-selected"
        data-active={active ? '' : undefined}
      >
        <CollapsibleTrigger
          aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
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
          {label}
        </Link>
      </div>
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
          {children}
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
          void navigate({ ...linkTo(DEFAULT_PANELS.editor, language), replace: true });
        }}
        value={null}
      >
        <ComboboxPrimitive.Trigger
          aria-label="Add language"
          render={
            <SidebarMenuSubButton
              className="w-full cursor-default text-text-2 [&>svg]:size-3"
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
