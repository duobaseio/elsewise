export {
  DaemonManifestPart,
  type Disposable,
  FrontendManifestPart,
  Manifest,
  PluginId,
  type PluginInfo,
} from '@elsewise/plugin';
export type {
  ActiveKeymap,
  ApplicationCommand,
  BaseCommand,
  Command,
  CommandGroup,
  Commands,
  EditorCommand,
  ProjectCommand,
  TerminalCommand,
  WorkspaceCommand,
} from './command';
export { DEFAULT_COMMAND_GROUPS, DEFAULT_COMMANDS, DEFAULT_KEYS } from './command';
export {
  type ContextMenuGroup,
  type ContextMenuItem,
  type ContextMenuSubmenuItem,
  DEFAULT_EDITOR_CONTEXT_MENU,
  DEFAULT_TERMINAL_CONTEXT_MENU,
} from './context-menu';
export {
  DEFAULT_DIFF_SOURCES,
  type EditorDiffContent,
  type EditorDiffSource,
  type EditorDiffs,
} from './editor/diff';
export {
  DEFAULT_ACTION_SOURCES,
  DEFAULT_FORMATTERS,
  DEFAULT_HOVER_SECTIONS,
  DEFAULT_NAVIGATION_SOURCES,
  EDITOR_DOCUMENT,
  type Editor,
  type EditorAction,
  type EditorActionSource,
  type EditorCompletion,
  type EditorCompletionIcon,
  type EditorDiagnostic,
  type EditorDiagnosticAction,
  type EditorDocument,
  type EditorDocumentLayout,
  type EditorFormatter,
  type EditorHoverSource,
  type EditorNavigation,
  type EditorNavigationSource,
} from './editor/editor';
export {
  type EditorLanguages,
  type LanguageServer,
  type LanguageServerTransport,
  workspaceConfiguration,
} from './editor/language';
export {
  DEFAULT_EDITOR_TOOLBAR,
  type EditorToolbarCommandItem,
  type EditorToolbarComponentItem,
  type EditorToolbarItem,
  type EditorToolbarProps,
} from './editor/toolbar';
export { Key, Keymap, Keys, PlatformKey } from './keymap';
export { type ActiveTheme, type Appearance, type Application, DEFAULT_ROUTES, type Plugin } from './plugin';
export type {
  CloneProgress,
  ExistingProjectSource,
  NewProjectSource,
  Project,
  ProjectClone,
  ProjectId,
  Projects,
} from './projects/projects';
export type {
  ProjectIcon,
  ProjectIconProps,
  ProjectSidebarItem,
  ProjectSidebarItemProps,
  WorkspaceSidebarItem,
  WorkspaceSidebarItemProps,
} from './projects/sidebar';
export type {
  ExistingWorkspaceSource,
  NewWorkspaceSource,
  Workspace,
  WorkspaceId,
  WorkspaceSource,
  WorkspaceStatus,
  WorkspaceStatusHandle,
  Workspaces,
} from './projects/workspaces';
export {
  DEFAULT_SETTINGS_GROUPS,
  type LocalSettingsPanel,
  type RemoteSettingsPanel,
  type Settings,
  type SettingsGroup,
  type SettingsLanguagePreview,
  type SettingsPanel,
  type SettingsSearchTerm,
} from './settings';
export type { Terminal } from './terminal';
export { Color, TextStyle, Theme, ThemeVariant } from './theme';
