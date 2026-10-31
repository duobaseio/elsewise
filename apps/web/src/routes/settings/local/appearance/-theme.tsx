import { DEFAULT_SETTINGS, type ThemeId } from '@elsewise/bridge';
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxValue,
} from '@elsewise/components/components/combobox';
import { Fragment, useMemo } from 'react';
import { sameTheme, useLoadedThemes } from '@/appearance/themes';
import { usePluginStore } from '@/plugins/plugin-store';

type ThemeGroup = { label: string | null; value: string; items: readonly ThemeItem[] };

type ThemeItem = { key: string; label: string; value: ThemeId | null };

const INHERITED: ThemeGroup = {
  label: null,
  value: 'inherited',
  items: [{ key: 'inherited', label: 'Same as interface', value: null }],
};

/**
 * A searchable select of the themes, grouped by where they come from.
 *
 * An inheritable select also offers to follow the interface's theme, which is `null`.
 */
export function ThemeSelect(
  props: { label: string } & (
    | { inheritable: true; theme: ThemeId | null; onChange: (theme: ThemeId | null) => void }
    | { inheritable?: false; theme: ThemeId; onChange: (theme: ThemeId) => void }
  ),
) {
  const themes = useThemeGroups();
  const groups = useMemo<readonly ThemeGroup[]>(
    () => (props.inheritable ? [INHERITED, ...themes] : themes),
    [props.inheritable, themes],
  );
  const selected = useMemo(() => {
    const items = groups.flatMap((group) => group.items);
    const fallback = props.inheritable ? null : DEFAULT_SETTINGS.appearance.general.theme;
    return (
      items.find((item) => sameThemeOrNone(item.value, props.theme)) ??
      items.find((item) => sameThemeOrNone(item.value, fallback)) ??
      null
    );
  }, [groups, props.theme, props.inheritable]);

  return (
    <Combobox
      autoHighlight
      isItemEqualToValue={(item: ThemeItem, value: ThemeItem) => sameThemeOrNone(item.value, value.value)}
      items={groups}
      onValueChange={(item: ThemeItem | null) => {
        if (item === null) {
          return;
        }
        if (props.inheritable) {
          props.onChange(item.value);
        } else if (item.value !== null) {
          props.onChange(item.value);
        }
      }}
      value={selected}
    >
      <ComboboxTrigger aria-label={props.label} className="w-60" size="sm">
        <ComboboxValue />
      </ComboboxTrigger>
      {/* Theme names come from plugins and users, so the popup grows to fit the longest instead of the trigger. */}
      <ComboboxContent align="end" className="w-auto max-w-(--available-width) min-w-(--anchor-width)">
        <ComboboxInput placeholder="Search themes" />
        <ComboboxEmpty>No themes found</ComboboxEmpty>
        <ComboboxList>
          {(group: ThemeGroup, index: number) => (
            <Fragment key={group.value}>
              {index > 0 && <ComboboxSeparator />}
              <ComboboxGroup items={group.items}>
                {group.label !== null && <ComboboxLabel>{group.label}</ComboboxLabel>}
                <ComboboxCollection>
                  {(item: ThemeItem) => (
                    <ComboboxItem key={item.key} value={item}>
                      {item.label}
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            </Fragment>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function useThemeGroups(): readonly ThemeGroup[] {
  const themes = useLoadedThemes();
  const plugins = usePluginStore((store) => store.plugins);

  return useMemo(() => {
    const groups = new Map<string, { label: string | null; value: string; items: ThemeItem[] }>();
    for (const { id, theme } of themes) {
      const key = id.source === 'plugin' ? `plugin/${id.plugin}` : id.source;
      let group = groups.get(key);
      if (group === undefined) {
        let label: string | null = null;
        if (id.source === 'plugin') {
          const plugin = plugins.find((other) => other.id === id.plugin);
          label = plugin !== undefined && plugin.status !== 'invalid' ? plugin.manifest.name : id.plugin;
        }
        group = { label, value: key, items: [] };
        groups.set(key, group);
      }
      group.items.push({ key: `${key}/${id.id}`, label: theme.name, value: id });
    }
    return [...groups.values()];
  }, [themes, plugins]);
}

function sameThemeOrNone(a: ThemeId | null, b: ThemeId | null): boolean {
  return a === null || b === null ? a === b : sameTheme(a, b);
}
