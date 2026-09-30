import {
  CaretDownIcon,
  CaretRightIcon,
  CaretUpIcon,
  CheckCircleIcon,
  CheckIcon,
  InfoIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  SidebarIcon,
  SpinnerIcon,
  WarningIcon,
  XCircleIcon,
  XIcon,
} from '@phosphor-icons/react';
import { type ComponentProps, type ComponentType, createContext, type ReactNode, useContext } from 'react';
import type { FileIconProvider } from './file-icon';

const DEFAULT_ICONS = {
  check: CheckIcon,
  indeterminate: MinusIcon,
  close: XIcon,
  submenu: CaretRightIcon,
  expand: CaretDownIcon,
  'scroll-up': CaretUpIcon,
  'scroll-down': CaretDownIcon,
  search: MagnifyingGlassIcon,
  success: CheckCircleIcon,
  info: InfoIcon,
  warning: WarningIcon,
  error: XCircleIcon,
  loading: SpinnerIcon,
  'sidebar-toggle': SidebarIcon,
} as const satisfies Record<string, ComponentType<ComponentProps<'svg'>>>;

export type IconName = keyof typeof DEFAULT_ICONS;

/**
 * Elsewise's system icons used by all other components. Unspecified icons default to Elsewise's Phosphor icons.
 *
 * Icons for file names and extensions are overridden via {@link FileIconProvider}.
 */
export type Icons = Partial<Record<IconName, ComponentType<ComponentProps<'svg'>>>>;

const IconContext = createContext<Icons>({});

/**
 * Provides the app's overridden system icons to every {@link Icon} beneath it.
 */
export function IconProvider({ icons, children }: { icons: Icons; children: ReactNode }) {
  return <IconContext value={icons}>{children}</IconContext>;
}

/**
 * A system icon used by other components.
 *
 * See {@link IconProvider} for overriding the default system icons.
 */
export function Icon({ name, ...props }: { name: IconName } & ComponentProps<'svg'>) {
  const Component = useContext(IconContext)[name] ?? DEFAULT_ICONS[name];
  return <Component {...props} />;
}
