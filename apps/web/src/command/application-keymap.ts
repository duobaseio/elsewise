import { PLATFORM, type Platform } from '@elsewise/components/lib/platform';
import type { ActiveKeymap, ApplicationCommand, EditorCommand, Key, Keymap, TerminalCommand } from '@elsewise/plugin';
import { normalizeKey } from '@/command/keys';

/**
 * The active keymap.
 */
export class ApplicationKeymap implements ActiveKeymap {
  private currentName = '';
  private currentCommands: ReadonlyMap<string, readonly Key[]> = new Map();
  private currentKeys: Readonly<Record<'application' | 'editor' | 'terminal', ReadonlyMap<string, readonly string[]>>> =
    {
      application: new Map(),
      editor: new Map(),
      terminal: new Map(),
    };

  constructor(private readonly platform: Platform = PLATFORM) {}

  get name(): string {
    return this.currentName;
  }

  /**
   * The commands and their keys as written.
   */
  get commands(): ReadonlyMap<string, readonly Key[]> {
    return this.currentCommands;
  }

  /**
   * The keys as CodeMirror normalizes them for this platform, and their associated commands from the last added to the
   * first.
   */
  get keys(): Readonly<Record<'application' | 'editor' | 'terminal', ReadonlyMap<string, readonly string[]>>> {
    return this.currentKeys;
  }

  /**
   * Updates the keys of `commands` under `keymap`.
   */
  update(keymap: Keymap, commands: Iterable<ApplicationCommand | EditorCommand | TerminalCommand>) {
    const written = new Map<string, readonly string[]>();
    const keys = {
      application: new Map<string, string[]>(),
      editor: new Map<string, string[]>(),
      terminal: new Map<string, string[]>(),
    };
    for (const command of commands) {
      const entry = Object.hasOwn(keymap.keys, command.id) ? keymap.keys[command.id] : undefined;
      const own: string[] = [];
      for (const binding of entry ?? command.defaultKeys ?? []) {
        const key = typeof binding === 'string' ? binding : (binding[this.platform] ?? binding.key);
        if (key === undefined) {
          continue;
        }

        const normalized = normalizeKey(key, this.platform);
        if (normalized === null) {
          console.warn(`Invalid key ${key} of command ${command.id}`);
          continue;
        }

        if (!own.includes(key)) {
          own.push(key);
        }
        const ids = keys[command.scope].get(normalized) ?? [];
        if (!ids.includes(command.id)) {
          keys[command.scope].set(normalized, [command.id, ...ids]);
        }
      }

      written.set(command.id, own);
    }

    // Keeps the commands when nothing changed, so that their identity tells whether they did.
    const previous = this.currentCommands;
    if (
      this.currentName !== keymap.name ||
      previous.size !== written.size ||
      [...written].some(([command, after]) => {
        const before = previous.get(command);
        return before?.length !== after.length || before.some((key, i) => key !== after[i]);
      })
    ) {
      this.currentName = keymap.name;
      this.currentCommands = written;
    }

    this.currentKeys = keys;
  }
}
