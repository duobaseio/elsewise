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
  FileTreeCommand,
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
  DEFAULT_FILE_TREE_CONTEXT_MENU,
  DEFAULT_PROJECT_CONTEXT_MENU,
  DEFAULT_TERMINAL_CONTEXT_MENU,
  DEFAULT_WORKSPACE_CONTEXT_MENU,
} from './context-menu';
export {
  DEFAULT_DIFF_SOURCE_GROUPS,
  type EditorDiffContent,
  type EditorDiffSource,
  type EditorDiffSourceGroup,
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
export type { FileTree, FileTreeSelection } from './file-tree';
export {
  Brightness,
  BundledKeymap,
  BundledTheme,
  CursorStyle,
  DEFAULT_FRONTEND_SETTINGS,
  DEFAULT_LANGUAGES,
  DiffLayout,
  EditorLanguageSettings,
  FONT_SIZES,
  Font,
  FontSize,
  FrontendSettings,
  KeymapId,
  LineHeight,
  LineSeparator,
  ThemeId,
} from './frontend-settings';
export { Key, Keymap, Keys, PlatformKey } from './keymap';
export type { FileFilter, PickPathsOptions, Platform } from './platform';
export { type ActiveTheme, type Appearance, type Application, DEFAULT_ROUTES, type Plugin } from './plugin';
export type {
  CloneProgress,
  ExistingProject,
  NewProject,
  Project,
  ProjectClone,
  ProjectId,
  Projects,
} from './projects/projects';
export type { RepositoryGroup, RepositoryItem, RepositorySource } from './projects/repositories';
export type {
  ProjectIcon,
  ProjectIconProps,
  ProjectSidebarItem,
  ProjectSidebarItemProps,
  WorkspaceSidebarItem,
  WorkspaceSidebarItemProps,
} from './projects/sidebar';
export { DEFAULT_PROJECT_SOURCE_GROUPS, type ProjectSource, type ProjectSourceGroup } from './projects/sources';
export type {
  ExistingWorkspace,
  NewWorkspace,
  Workspace,
  WorkspaceAggregateStatus,
  WorkspaceId,
  WorkspaceStatus,
  WorkspaceStatusHandle,
  Workspaces,
} from './projects/workspaces';
export type {
  LocalSettingsPanel,
  RemoteSettingsPanel,
  Settings,
  SettingsLanguagePreview,
  SettingsPanel,
  SettingsSearchTerm,
} from './settings';
export type { Terminal } from './terminal';
export { Color, TextStyle, Theme, ThemeVariant } from './theme';
