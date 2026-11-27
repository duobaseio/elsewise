import { DockTabHeader } from '@elsewise/components/components/dock';
import { FileIcon } from '@elsewise/components/components/file-icon';
import { cn } from '@elsewise/components/lib/utils';
import { HelpIllustration } from '../-help-illustration';

export function TabTooltipsHelp({ enabled }: { enabled: boolean }) {
  return (
    <HelpIllustration className="h-24 bg-background">
      <div className="flex h-9 border-border border-b bg-surface px-1">
        {['main.rs', 'lexer.rs'].map((name, index) => (
          <div
            className={cn(
              'relative isolate before:absolute before:inset-[3px_1px_4px] before:-z-10 before:rounded-md',
              index === 0 && 'dv-active-tab before:bg-layer-selected',
            )}
            key={name}
          >
            <DockTabHeader icon={<FileIcon name={name} />} title={name} onClose={() => {}} />
          </div>
        ))}
      </div>
      {enabled && (
        <div className="mt-1 ml-1 w-fit whitespace-nowrap rounded-md bg-popover px-3 py-1.5 text-sm shadow-md ring-1 ring-foreground/10">
          /home/elsewise/src/main.rs
        </div>
      )}
    </HelpIllustration>
  );
}

export function FolderPrefixHelp({ enabled }: { enabled: boolean }) {
  return (
    <HelpIllustration className="h-24 bg-background">
      <div className="flex h-9 border-border border-b bg-surface px-1">
        {['routes', 'settings'].map((folder, index) => (
          <div
            className={cn(
              'relative isolate before:absolute before:inset-[3px_1px_4px] before:-z-10 before:rounded-md',
              index === 0 && 'dv-active-tab before:bg-layer-selected',
            )}
            key={folder}
          >
            <DockTabHeader
              icon={<FileIcon name="index.tsx" />}
              title={enabled ? `${folder}/index.tsx` : 'index.tsx'}
              onClose={() => {}}
            />
          </div>
        ))}
      </div>
    </HelpIllustration>
  );
}
