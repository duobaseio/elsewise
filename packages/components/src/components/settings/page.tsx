import type { ReactNode } from 'react';

export type PageProps = {
  /**
   * The page's title.
   */
  title: ReactNode;

  /**
   * The page's rows.
   */
  children?: ReactNode;
};

/**
 * A settings page.
 */
export function Page({ title, children }: PageProps) {
  return (
    <div className="flex max-w-3xl flex-col gap-8 p-8" data-slot="page">
      <h1 className="text-heading-lg">{title}</h1>
      {children}
    </div>
  );
}
