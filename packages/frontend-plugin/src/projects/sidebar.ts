import type { ComponentType, ReactNode } from 'react';
import type { Project } from './projects';
import type { Workspace } from './workspaces';

/**
 * A project icon's props.
 */
export interface ProjectIconProps {
  readonly project: Project;

  /**
   * The icon the icons after this one would render, e.g. to render while loading or for a project this icon is not for.
   */
  readonly fallback: ReactNode;
}

/**
 * A project's icon.
 *
 * Icons are tried by `order`, lowest first and by id when equal, ending in the default icon. Each renders its own icon
 * or its `fallback`, the icon the rest would render. Icons without an order are tried last. An icon that throws renders
 * its `fallback`.
 */
export interface ProjectIcon {
  /**
   * The icon's id, namespaced by the plugin's, e.g. `io.example.github`. Omitted if the id already exists.
   */
  readonly id: string;

  /**
   * The order it is tried in, lowest first and by id when equal. Icons without one are tried last.
   */
  readonly order?: number;

  /**
   * The component it renders, in a 16px square.
   *
   * ```tsx
   * function GitHubIcon({ project, fallback }: ProjectIconProps) {
   *   const owner = useOwner(project);
   *   return owner ? <img alt="" height={16} src={`https://github.com/${owner}.png`} width={16} /> : fallback;
   * }
   * ```
   */
  readonly component: ComponentType<ProjectIconProps>;
}

/**
 * The props of a project's sidebar item.
 */
export interface ProjectSidebarItemProps {
  readonly project: Project;
}

/**
 * An item in a project's sidebar row, between its name and its chevron.
 *
 * Items are positioned by `order` from right to left, and by id when equal. Items without an order are leftmost. The
 * component is rendered inside Elsewise's React tree, in the row's height of 32px. It is hidden if it throws.
 */
export interface ProjectSidebarItem {
  /**
   * The item's id, namespaced by the plugin's, e.g. `io.example.ci`. Omitted if the id already exists.
   */
  readonly id: string;

  /**
   * The order of this item in the row, shown from right to left and by id when equal. Items without one are leftmost.
   */
  readonly order?: number;

  /**
   * The component it renders.
   *
   * Return `null` to render nothing. An empty element still has a gap in the row.
   */
  readonly component: ComponentType<ProjectSidebarItemProps>;
}

/**
 * The props of a workspace's sidebar item.
 */
export interface WorkspaceSidebarItemProps {
  readonly workspace: Workspace;
}

/**
 * An item in a workspace's sidebar row, between its name and its delete button.
 *
 * Items are positioned by `order` from right to left, and by id when equal. Items without an order are leftmost. The
 * component is rendered inside Elsewise's React tree, in the row's height of 28px. It is hidden if it throws.
 */
export interface WorkspaceSidebarItem {
  /**
   * The item's id, namespaced by the plugin's, e.g. `io.example.pull-request`. Omitted if the id already exists.
   */
  readonly id: string;

  /**
   * The order of this item in the row, shown from right to left and by id when equal. Items without one are leftmost.
   */
  readonly order?: number;

  /**
   * The component it renders.
   *
   * Return `null` to render nothing. An empty element still has a gap in the row.
   */
  readonly component: ComponentType<WorkspaceSidebarItemProps>;
}
