import { Button } from '@elsewise/components/components/button';
import { Icon } from '@elsewise/components/components/icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@elsewise/components/components/tooltip';
import type { EditorToolbarProps } from '@elsewise/plugin';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { EDITOR_DIFF } from '@/editor/diff/diff';
import { DiffSourceMenu } from '@/editor/diff/diff-source-menu';
import { useEditorManager } from '@/editor/editor-manager';

/**
 * The toolbar's Compare button, which opens the sources while the file is not compared.
 */
export function CompareToolbarItem({ view, subscribe }: EditorToolbarProps) {
  const listen = useCallback((listener: () => void) => subscribe(() => listener()), [subscribe]);
  const sources = useEditorManager((editor) => editor.diffs.sources);
  const comparing = useSyncExternalStore(listen, () => view.state.facet(EDITOR_DIFF)?.source != null);
  const ref = useMemo(() => ({ current: view }), [view]);

  if (comparing || sources.length === 0) {
    return null;
  }

  return (
    <Tooltip>
      <DiffSourceMenu
        view={ref}
        trigger={
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="size-5 text-muted-foreground hover:text-foreground"
                aria-label="Compare with…"
              />
            }
          >
            <Icon name="compare" />
          </TooltipTrigger>
        }
      />
      <TooltipContent side="bottom">Compare with…</TooltipContent>
    </Tooltip>
  );
}
