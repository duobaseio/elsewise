import type { ReactNode } from 'react';

/**
 * The header of a tool panel.
 */
export function DockToolHeader({
  icon,
  title,
}: {
  /**
   * The icon before the title.
   */
  icon?: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className="flex h-full items-center gap-1.5 px-4 text-base text-text-2">
      {icon}
      <span>{title}</span>
    </div>
  );
}
