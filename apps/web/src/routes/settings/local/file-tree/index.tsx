import { Page, Row } from '@elsewise/components/components/settings';
import { Switch } from '@elsewise/components/components/switch';
import type { FrontendSettings, SettingsSearchTerm } from '@elsewise/frontend-plugin';
import { createFileRoute } from '@tanstack/react-router';
import { useSettings, useUpdateSettingsSection } from '@/settings/settings';
import { GitStatusBadgesHelp, IndentGuidesHelp } from './-help';
import { HiddenRow } from './-hidden-row';

export const Route = createFileRoute('/settings/local/file-tree/')({ component: FileTree });

export const FILE_TREE_TERMS = {
  gitStatusBadges: {
    label: 'Git status badges',
    keywords: ['file tree', 'letters', 'markers', 'decorations', 'modified', 'changed files', 'git'],
  },
  indentGuides: { label: 'Indent guides', keywords: ['file tree', 'indentation', 'lines', 'nesting', 'levels'] },
  hidden: {
    label: 'Hidden files',
    keywords: ['file tree', 'exclude', 'ignore', 'globs', 'patterns', 'folders'],
  },
} as const satisfies Record<keyof FrontendSettings['fileTree'], SettingsSearchTerm>;

export function FileTree() {
  const fileTree = useSettings((settings) => settings.fileTree);
  const set = useUpdateSettingsSection('fileTree');

  return (
    <Page title="File tree">
      <Row
        id="gitStatusBadges"
        label={FILE_TREE_TERMS.gitStatusBadges.label}
        description="Indicate changed files in the file tree with a badge."
        help={<GitStatusBadgesHelp enabled={fileTree.gitStatusBadges}>Requires a git repository.</GitStatusBadgesHelp>}
      >
        <Switch
          aria-label={FILE_TREE_TERMS.gitStatusBadges.label}
          checked={fileTree.gitStatusBadges}
          onCheckedChange={(gitStatusBadges) => set({ gitStatusBadges })}
        />
      </Row>

      <Row
        id="indentGuides"
        label={FILE_TREE_TERMS.indentGuides.label}
        description="Show a vertical line for each folder level in the file tree."
        help={<IndentGuidesHelp enabled={fileTree.indentGuides} />}
      >
        <Switch
          aria-label={FILE_TREE_TERMS.indentGuides.label}
          checked={fileTree.indentGuides}
          onCheckedChange={(indentGuides) => set({ indentGuides })}
        />
      </Row>

      <HiddenRow term={FILE_TREE_TERMS.hidden} />
    </Page>
  );
}
