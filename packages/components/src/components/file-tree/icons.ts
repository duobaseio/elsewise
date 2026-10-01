'use client';

import type { FileTreeIconConfig } from '@pierre/trees';
import { type ComponentProps, type ComponentType, createElement, useMemo } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { type FileIconData, type IconTint, PHOSPHOR_ICONS } from '../../lib/file-icons.gen';
import { type FileIcons, useFileIcons } from '../file-icon';
import { useIcons } from '../icon';

// TODO: This implementation is absolute dogshit and we should reimplement this if/when pierre trees exposes a better API.

const SIMPLE_ICONS_SIZE = 24;
const DEVICON_SIZE = 128;
const PHOSPHOR_SIZE = 256;
const LETTER_SIZE: Record<number, string> = { 1: '8.5px', 2: '8.5px', 3: '5.75px' };

const CHEVRON_ID = 'ew-chevron';

// Phosphor's box widened until the chevron draws at three quarters of its lane: sizing the `<svg>` would shrink the
// lane every indent is measured from.
const CHEVRON_VIEW_BOX = '-42.6667 -42.6667 341.3333 341.3333';

const ICON_URLS = new WeakMap<ComponentType<ComponentProps<'svg'>>, string>();

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

export function useFileTreeIcons(): FileTreeIconConfig {
  const chevron = iconUrl(useIcons().expand);
  const fileIcons = useFileIcons();
  return useMemo(() => fileTreeIcons(fileIcons, chevron), [fileIcons, chevron]);
}

export function fileTreeIcons(fileIcons: FileIcons, chevron: string): FileTreeIconConfig {
  // The chevron alone inherits its fill, the lane's muted ink.
  const symbols = [maskedSymbol(CHEVRON_ID, PHOSPHOR_SIZE, chevron, 'inherit', CHEVRON_VIEW_BOX)];
  const ids = new Map<string, string>();

  // Two specs that draw identically share one symbol. The `ew-` namespace keeps the library's `isBuiltInSpriteSheet`
  // from claiming the sheet.
  const idOf = (spec: FileIconData): string => {
    const key = JSON.stringify(spec);
    let id = ids.get(key);
    if (id === undefined) {
      id = `ew-icon-${ids.size}`;
      ids.set(key, id);
      symbols.push(symbolFor(id, spec));
    }
    return id;
  };

  // The library lowercases both its rule keys and a row's name; `useFileIcons()` has already lowercased ours, so no
  // two collide and leave a symbol no rule reaches.
  const rulesFor = (icons: Record<string, FileIconData>) => {
    const rules: Record<string, string> = {};
    for (const [key, spec] of Object.entries(icons)) {
      rules[key] = idOf(spec);
    }
    return rules;
  };

  const byFileName = rulesFor(fileIcons.names);
  const byFileExtension = rulesFor(fileIcons.extensions);
  // Before the sheet is joined: the fallback need not appear in either table.
  const fallbackId = idOf(fileIcons.fallback);

  return {
    set: 'none',
    spriteSheet: `<svg data-ew-icon-sprite aria-hidden="true" width="0" height="0">${symbols.join('')}</svg>`,
    byFileName,
    byFileExtension,
    remap: {
      'file-tree-icon-chevron': CHEVRON_ID,
      'file-tree-icon-file': fallbackId,
    },
  };
}

function symbolFor(id: string, spec: FileIconData): string {
  switch (spec.kind) {
    case 'glyph':
      return maskedSymbol(id, SIMPLE_ICONS_SIZE, spec.src, fillOf(spec.tint));
    case 'brand':
      return `<symbol id="${id}" viewBox="0 0 ${DEVICON_SIZE} ${DEVICON_SIZE}"><image href="${spec.src}" x="0" y="0" width="${DEVICON_SIZE}" height="${DEVICON_SIZE}"/></symbol>`;
    case 'phosphor':
      return maskedSymbol(id, PHOSPHOR_SIZE, iconUrl(PHOSPHOR_ICONS[spec.name]), fillOf(spec.tint));
    case 'letters': {
      const fill = fillOf(spec.tint);
      const line = spec.tint === null ? 'var(--border)' : `color-mix(in srgb, ${fill} 45%, transparent)`;
      const size = LETTER_SIZE[Math.min(spec.letters.length, 3)];
      return [
        `<symbol id="${id}" viewBox="0 0 16 16">`,
        // Inset by half the stroke: a rect on the box edge would have half its line cropped by the viewBox.
        `<rect x="0.5" y="0.5" width="15" height="15" rx="3" style="fill: none; stroke: ${line}"/>`,
        `<text x="8" y="8.5" text-anchor="middle" dominant-baseline="central"`,
        ` style="fill: ${fill}; font-family: var(--trees-font-family); font-size: ${size}; font-weight: 500; letter-spacing: -0.025em">`,
        spec.letters,
        `</text>`,
        `</symbol>`,
      ].join('');
    }
  }
}

// The asset as an alpha mask over a filled rect. Alpha, not luminance: the sources rasterize black.
function maskedSymbol(id: string, size: number, url: string, fill: string, viewBox = `0 0 ${size} ${size}`): string {
  const box = `x="0" y="0" width="${size}" height="${size}"`;
  return [
    `<symbol id="${id}" viewBox="${viewBox}">`,
    `<mask id="${id}-mask" maskUnits="userSpaceOnUse" ${box} style="mask-type: alpha">`,
    `<image href="${url}" ${box}/>`,
    `</mask>`,
    `<rect ${box} mask="url(#${id}-mask)" style="fill: ${fill}"/>`,
    `</symbol>`,
  ].join('');
}

// Always a fill: inheriting would take the lane's muted ink.
function fillOf(tint: IconTint | null): string {
  return tint === null ? 'var(--trees-fg)' : `light-dark(${tint.light}, ${tint.dark})`;
}
