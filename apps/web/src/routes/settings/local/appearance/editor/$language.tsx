import type { EditorLanguageSettings } from '@elsewise/bridge';
import { Button } from '@elsewise/components/components/button';
import { SplitPage } from '@elsewise/components/components/settings';
import { DEFAULT_ROUTES } from '@elsewise/plugin';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { LANGUAGES } from '@/settings/languages';
import { useSettings, useUpdateSettings } from '@/settings/settings';
import { useSettingsPanels } from '@/settings/settings-panel-manager';
import { LanguageRows } from './-language-rows';
import { Preview } from './-preview';
import { EDITOR_TERMS } from './index';

export const Route = createFileRoute('/settings/local/appearance/editor/$language')({
  // Redirect aliases, e.g. JSX, to the canonical page, e.g. JS.
  beforeLoad: ({ params: { language } }) => {
    const name = LANGUAGES[language]?.name;
    if (name !== undefined && name !== language) {
      throw redirect({ to: '/settings/local/appearance/editor/$language', params: { language: name }, replace: true });
    }
  },
  component: LanguageRoute,
});

function LanguageRoute() {
  const { language } = Route.useParams();
  return <Language language={language} />;
}

export function Language({ language }: { language: string }) {
  const editor = useSettings((settings) => settings.appearance.editor);
  const update = useUpdateSettings();
  const navigate = useNavigate();

  const overrides = editor.languages[language] ?? {};
  const values: EditorLanguageSettings = {
    tabSize: overrides.tabSize ?? editor.tabSize,
    indentUnit: overrides.indentUnit ?? editor.indentUnit,
    lineSeparator: overrides.lineSeparator ?? editor.lineSeparator,
    visualGuides: overrides.visualGuides ?? editor.visualGuides,
  };

  const setOverrides = (next: Partial<EditorLanguageSettings> | undefined) => {
    update((settings) => {
      const { [language]: _, ...rest } = settings.appearance.editor.languages;
      return {
        ...settings,
        appearance: {
          ...settings.appearance,
          editor: {
            ...settings.appearance.editor,
            languages: next === undefined ? rest : { ...rest, [language]: next },
          },
        },
      };
    });
  };

  const untouched = Object.keys(overrides).length === 0;

  const added = useSettingsPanels((settings) => settings.previews[language]);
  const preview =
    added === undefined
      ? LANGUAGES[language]
      : { name: language, label: LANGUAGES[language]?.label ?? language, path: added.path, preview: added.code };

  return (
    <SplitPage preview={<Preview language={preview} />} title={preview?.label ?? language}>
      <LanguageRows
        onChange={(patch) => setOverrides({ ...overrides, ...patch })}
        onReset={(key) => {
          const { [key]: _, ...rest } = overrides;
          setOverrides(rest);
        }}
        overrides={overrides}
        terms={EDITOR_TERMS}
        values={values}
      />

      <div className="flex justify-end gap-2">
        <Button disabled={untouched} onClick={() => setOverrides({})} size="sm" variant="outline">
          Reset
        </Button>
        <Button
          onClick={() => {
            setOverrides(undefined);
            void navigate({ to: DEFAULT_ROUTES.settings.editor, replace: true });
          }}
          size="sm"
          variant="destructive"
        >
          Remove language
        </Button>
      </div>
    </SplitPage>
  );
}
