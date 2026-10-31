import { type CommandCategory, DEFAULT_COMMAND_CATEGORIES } from '@elsewise/plugin';

const { application, editor, terminal } = DEFAULT_COMMAND_CATEGORIES;

export const APPLICATION: CommandCategory = { id: application.id, label: 'Application' };

export const EDITOR: CommandCategory = { id: editor.id, label: 'Editor' };

export const EDITOR_CODE: CommandCategory = { id: editor.code, in: editor.id, label: 'Code' };

export const EDITOR_DIFF: CommandCategory = { id: editor.diff, in: editor.id, label: 'Compare' };

export const EDITOR_EDIT: CommandCategory = { id: editor.edit, in: editor.id, label: 'Edit' };

export const EDITOR_NAVIGATE: CommandCategory = { id: editor.navigate, in: editor.id, label: 'Navigate' };

export const TERMINAL: CommandCategory = { id: terminal.id, label: 'Terminal' };
