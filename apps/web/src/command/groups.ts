import { type CommandGroup, DEFAULT_COMMAND_GROUPS } from '@elsewise/frontend-plugin';

const { application, editor, terminal } = DEFAULT_COMMAND_GROUPS;

export const APPLICATION: CommandGroup = { id: application.id, label: 'Application' };

export const EDITOR: CommandGroup = { id: editor.id, label: 'Editor' };

export const EDITOR_CODE: CommandGroup = { id: editor.code, in: editor.id, label: 'Code' };

export const EDITOR_DIFF: CommandGroup = { id: editor.diff, in: editor.id, label: 'Compare' };

export const EDITOR_EDIT: CommandGroup = { id: editor.edit, in: editor.id, label: 'Edit' };

export const EDITOR_NAVIGATE: CommandGroup = { id: editor.navigate, in: editor.id, label: 'Navigate' };

export const TERMINAL: CommandGroup = { id: terminal.id, label: 'Terminal' };
