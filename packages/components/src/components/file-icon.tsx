'use client';

import { type CSSProperties, createContext, type ReactNode, useContext, useMemo } from 'react';

import {
  EXTENSION_ICONS,
  FALLBACK_FILE_ICON,
  FILENAME_ICONS,
  type FileIconData,
  type IconTint,
  PHOSPHOR_ICONS,
} from '../lib/file-icons.gen';
import { cn } from '../lib/utils';
import type { IconProvider } from './icon';

const ICON_CLASS = 'size-4 shrink-0';

const TINT_CLASS = 'text-(--icon-tint-light) dark:text-(--icon-tint-dark)';

const TINT_LINE_CLASS =
  'border-[color-mix(in_srgb,var(--icon-tint-light)_45%,transparent)] dark:border-[color-mix(in_srgb,var(--icon-tint-dark)_45%,transparent)]';

const LETTER_SIZE: Record<number, string> = {
  0: 'text-[8.5px]/none',
  1: 'text-[8.5px]/none',
  2: 'text-[8.5px]/none',
  3: 'text-[5.75px]/none',
};

function lowercase(icons: Record<string, FileIconData>): Record<string, FileIconData> {
  const entries = Object.entries(icons).filter(([, icon]) => icon !== undefined);
  return Object.fromEntries(entries.map(([key, icon]) => [key.toLowerCase(), icon]));
}

/**
 * Elsewise's file icons used by {@link FileIcon}. Exact names take precedence over extensions.
 *
 * See {@link IconProvider} for system icons.
 */
export type FileIcons = {
  /** By whole filename, such as `Dockerfile`. */
  names: Record<string, FileIconData>;
  /** By extension without its leading dot, such as `ts` or `d.ts`. */
  extensions: Record<string, FileIconData>;
  /** For a name that has no match. */
  fallback: FileIconData;
};

/** Elsewise's generated file icons, keyed in lowercase. */
export const DEFAULT_FILE_ICONS: FileIcons = {
  names: lowercase(FILENAME_ICONS),
  extensions: lowercase(EXTENSION_ICONS),
  fallback: FALLBACK_FILE_ICON,
};

const FileIconContext = createContext<FileIcons>(DEFAULT_FILE_ICONS);

/**
 * Provides the app's additional and overridden file icons to every {@link FileIcon} beneath it. Unspecified icons
 * default to Elsewise's generated file icons.
 */
export function FileIconProvider({ icons, children }: { icons: Partial<FileIcons>; children: ReactNode }) {
  const resolved = useMemo(() => {
    return {
      names: { ...DEFAULT_FILE_ICONS.names, ...lowercase(icons.names ?? {}) },
      extensions: { ...DEFAULT_FILE_ICONS.extensions, ...lowercase(icons.extensions ?? {}) },
      fallback: icons.fallback ?? FALLBACK_FILE_ICON,
    };
  }, [icons]);
  return <FileIconContext value={resolved}>{children}</FileIconContext>;
}
/**
 * Every file icon, keyed in lowercase.
 */
export function useFileIcons(): FileIcons {
  return useContext(FileIconContext);
}

/**
 * A file's icon.
 *
 * `name` is a file's base name, e.g. `main.ts`. Matching is case-insensitive, as it is in the file tree. A whole
 * filename wins, then the longest matching extension, e.g. `main.d.ts` uses `d.ts` over `ts`.
 *
 * See {@link FileIconProvider} for overriding the default file icons.
 */
export function FileIcon({ name, className }: { name: string; className?: string }) {
  const data = resolve(name, useFileIcons());
  switch (data.kind) {
    case 'glyph':
      return (
        <span
          aria-hidden
          data-slot="file-icon"
          style={
            {
              '--icon-tint-light': data.tint.light,
              '--icon-tint-dark': data.tint.dark,
              maskImage: `url("${data.src}")`,
              maskSize: 'contain',
              maskRepeat: 'no-repeat',
              maskPosition: 'center',
            } as CSSProperties
          }
          className={cn(ICON_CLASS, 'bg-current', TINT_CLASS, className)}
        />
      );
    case 'brand':
      return <img aria-hidden alt="" data-slot="file-icon" src={data.src} className={cn(ICON_CLASS, className)} />;
    case 'phosphor':
      return <PhosphorIcon name={data.name} tint={data.tint} className={className} />;
    case 'letters':
      return <LetterIcon letters={data.letters} tint={data.tint} className={className} />;
  }
}

function resolve(name: string, { names, extensions, fallback }: FileIcons): FileIconData {
  name = name.toLowerCase();

  // `hasOwn`, or a file named `constructor` finds `Object.prototype`'s.
  if (Object.hasOwn(names, name)) {
    return names[name];
  }

  let dot = name.indexOf('.');
  while (dot !== -1) {
    const extension = name.slice(dot + 1);
    if (Object.hasOwn(extensions, extension)) {
      return extensions[extension];
    }
    dot = name.indexOf('.', dot + 1);
  }

  return fallback;
}

function PhosphorIcon({
  name,
  tint,
  className,
}: {
  name: keyof typeof PHOSPHOR_ICONS;
  tint: IconTint | null;
  className?: string;
}) {
  const Icon = PHOSPHOR_ICONS[name];
  return (
    <Icon
      aria-hidden
      data-slot="file-icon"
      style={
        tint === null
          ? undefined
          : ({
              '--icon-tint-light': tint.light,
              '--icon-tint-dark': tint.dark,
            } as CSSProperties)
      }
      className={cn(ICON_CLASS, tint === null ? 'text-foreground' : TINT_CLASS, className)}
    />
  );
}

function LetterIcon({ letters, tint, className }: { letters: string; tint: IconTint | null; className?: string }) {
  return (
    <span
      aria-hidden
      data-slot="file-icon"
      style={
        tint === null
          ? undefined
          : ({
              '--icon-tint-light': tint.light,
              '--icon-tint-dark': tint.dark,
            } as CSSProperties)
      }
      className={cn(
        ICON_CLASS,
        'flex items-center justify-center rounded-[3px] border font-medium tracking-tight',
        LETTER_SIZE[Math.min(letters.length, 3)],
        tint === null ? 'border-border text-foreground' : cn(TINT_CLASS, TINT_LINE_CLASS),
        className,
      )}
    >
      {letters}
    </span>
  );
}
