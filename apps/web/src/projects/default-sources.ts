import { toast } from '@elsewise/components/components/toast';
import { DEFAULT_PROJECT_SOURCE_GROUPS, type ProjectSourceGroup } from '@elsewise/frontend-plugin';
import type { ApplicationManager } from '@/application-manager';

const { add } = DEFAULT_PROJECT_SOURCE_GROUPS;

export const DEFAULT_PROJECT_SOURCES: readonly ProjectSourceGroup[] = [
  {
    id: add.id,
    order: add.order,
    sources: [
      {
        id: add.sources.new.id,
        order: add.sources.new.order,
        label: 'New project…',
        add: async ({ sidebar }: ApplicationManager, daemonId) => {
          sidebar.newProjectDialog.openWithPayload({ daemon: daemonId });
          return null;
        },
      },
      {
        id: add.sources.import.id,
        order: add.sources.import.order,
        label: 'Import project…',
        shown: () => window.bridge?.window?.pickPaths !== undefined,
        add: async ({ platform, projects }, daemonId) => {
          const [absolutePath] = await platform.pickPaths({ kind: 'folder' });
          if (absolutePath === undefined) {
            return null;
          }

          try {
            return await projects.add(daemonId, { type: 'existing', absolutePath });
          } catch (error) {
            toast.add({
              type: 'error',
              title: `Could not import “${absolutePath.split('/').at(-1) ?? absolutePath}”`,
              description: error instanceof Error ? error.message : String(error),
            });
            return null;
          }
        },
      },
    ],
  },
];
