import * as z from 'zod';

export type Keymap = z.infer<typeof Keymap>;
export type Keys = z.infer<typeof Keys>;
export type PlatformKey = z.infer<typeof PlatformKey>;
export type Key = z.infer<typeof Key>;

/**
 * A sparse map of commands and their keys.
 *
 * Entries for unknown commands are always kept. A command without an entry uses its default keys.
 */
export const Keymap = z.lazy(() =>
  z.object({
    /**
     * The keymap's display name. Cannot be blank.
     */
    name: z.string().regex(/\S/),
    /**
     * The command ids, e.g. `io.example.rename`, and their keys.
     *
     * An entry replaces the command's default keys. An invalid entry is ignored rather than failing the keymap.
     */
    keys: z.record(z.string(), Keys.optional().catch(undefined)),
  }),
);

/**
 * A command's keys.
 */
export const Keys = z.lazy(() => z.array(z.union([Key, PlatformKey])));

/**
 * A key, overridden on the platforms that name their own.
 */
export const PlatformKey = z.lazy(() =>
  z.object({
    key: Key,
    mac: Key.optional(),
    windows: Key.optional(),
    linux: Key.optional(),
  }),
);

/**
 * One keystroke in CodeMirror's notation, its modifiers joined by `-`, e.g. `Mod-Shift-k`.
 *
 * A sequence such as `Ctrl-k Ctrl-s` is invalid.
 */
export const Key = z.string().regex(/^(?:(?:mod|cmd|meta|m|ctrl|control|c|alt|a|shift|s)-)*(?:\S|[a-z][a-z0-9]*)$/i);
