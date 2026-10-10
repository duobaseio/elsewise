'use client';

import {
  ArrowSquareOutIcon,
  CaretDownIcon,
  CaretRightIcon,
  CaretUpIcon,
  CheckCircleIcon,
  CheckIcon,
  FolderIcon,
  FolderOpenIcon,
  GearIcon,
  InfoIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  PlusIcon,
  SidebarIcon,
  SpinnerIcon,
  TreeViewIcon,
  WarningIcon,
  XCircleIcon,
  XIcon,
} from '@phosphor-icons/react';
import {
  type ComponentProps,
  type ComponentType,
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useMemo,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FileIconProvider } from './file-icon';

const DEFAULT_ICONS = {
  check: CheckIcon,
  indeterminate: MinusIcon,
  close: XIcon,
  submenu: CaretRightIcon,
  expand: CaretDownIcon,
  'scroll-up': CaretUpIcon,
  'scroll-down': CaretDownIcon,
  previous: CaretUpIcon,
  next: CaretDownIcon,
  search: MagnifyingGlassIcon,
  success: CheckCircleIcon,
  info: InfoIcon,
  warning: WarningIcon,
  error: XCircleIcon,
  external: ArrowSquareOutIcon,
  loading: SpinnerIcon,
  'sidebar-toggle': SidebarIcon,
  folder: FolderIcon,
  'folder-open': FolderOpenIcon,
  add: PlusIcon,
  files: TreeViewIcon,
  settings: GearIcon,
} as const satisfies Record<string, ComponentType<ComponentProps<'svg'>>>;

export type IconName = keyof typeof DEFAULT_ICONS;

/**
 * Elsewise's system icons used by all other components.
 *
 * See {@link FileIconProvider} for file names and extensions' icons.
 */
export type Icons = Record<IconName, ComponentType<ComponentProps<'svg'>>>;

const IconContext = createContext<Icons>(DEFAULT_ICONS);

/**
 * Provides the app's overridden system icons to every {@link Icon} beneath it. Unspecified icons default to Elsewise's
 * Phosphor icons.
 */
export function IconProvider({ icons, children }: { icons: Partial<Icons>; children: ReactNode }) {
  const resolved = useMemo(() => {
    const overrides = Object.fromEntries(Object.entries(icons).filter(([, icon]) => icon !== undefined));
    return { ...DEFAULT_ICONS, ...overrides };
  }, [icons]);
  return <IconContext value={resolved}>{children}</IconContext>;
}

/**
 * Every system icon.
 */
export function useIcons(): Icons {
  return useContext(IconContext);
}

/**
 * A system icon used by other components.
 *
 * See {@link IconProvider} for overriding the default system icons.
 */
export function Icon({ name, ...props }: { name: IconName } & ComponentProps<'svg'>) {
  const Component = useIcons()[name];
  return <Component {...props} />;
}

const ICON_URLS = new WeakMap<ComponentType<ComponentProps<'svg'>>, string>();

/**
 * Returns `icon` as a `data:` URI, for use where an icon needs to be rendered outside of React.
 */
export function iconUrl(icon: ComponentType<ComponentProps<'svg'>>): string {
  if (typeof document === 'undefined') {
    return '';
  }

  let url = ICON_URLS.get(icon);
  if (url === undefined) {
    const markup = renderToStaticMarkup(createElement(icon));
    const svg = markup.includes('xmlns=') ? markup : markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    ICON_URLS.set(icon, url);
  }
  return url;
}
