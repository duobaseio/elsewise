import { PLATFORM } from '@elsewise/components/lib/platform';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import { FitAddon } from '@xterm/addon-fit';
import { LigaturesAddon } from '@xterm/addon-ligatures';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { type ITerminalAddon, type ITheme, Terminal as XTerm } from '@xterm/xterm';
import { type KeyboardEvent, type RefObject, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useActiveTheme } from '@/appearance/themes';
import { monoFontStack } from '@/settings/fonts';
import { useSettings } from '@/settings/settings';
import { ClipboardShortcuts } from '@/terminal/clipboard-shortcuts';
import { LIMIT, type TerminalSearch, TerminalSearchBar } from '@/terminal/terminal-search-bar';

import '@xterm/xterm/css/xterm.css';
import './terminal.css';

/** `session` is the shell on the far side: an addon that reads the terminal's input and writes its output. */
export function Terminal({ session, ref }: { session: ITerminalAddon; ref?: RefObject<XTerm | null> }) {
  const host = useRef<HTMLDivElement>(null);
  const [terminal, setTerminal] = useState<{ xterm: XTerm; fit: FitAddon; search: SearchAddon } | null>(null);
  const ligatures = useRef<LigaturesAddon>(null);
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState<TerminalSearch>({
    query: '',
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  });
  const findField = useRef<HTMLInputElement>(null);

  const colors = useActiveTheme().terminal;
  const theme = useMemo<ITheme>(() => {
    const { selection, searchMatch, searchMatchSelected, searchMatchSelectedBorder, ...rest } = colors;
    return { ...rest, selectionBackground: selection };
  }, [colors]);
  const font = useSettings((settings) => settings.appearance.terminal.font);
  const cursorStyle = useSettings((settings) => settings.appearance.terminal.cursorStyle);
  const cursorInactiveStyle = cursorStyle === 'block' ? 'outline' : cursorStyle;
  const cursorBlink = useSettings((settings) => settings.appearance.terminal.cursorBlink);
  const copyOnSelect = useSettings((settings) => settings.appearance.terminal.copyOnSelect);
  const macOptionIsMeta = useSettings((settings) => settings.appearance.terminal.macOptionIsMeta);
  const scrollback = useSettings((settings) => settings.appearance.terminal.scrollback);

  const decorations = useMemo(() => {
    const { background, searchMatch, searchMatchSelected, searchMatchSelectedBorder } = colors;
    return {
      matchBackground: opaque(searchMatch, background),
      matchOverviewRuler: opaque(searchMatch, background),
      activeMatchBackground: opaque(searchMatchSelected, background),
      activeMatchBorder: searchMatchSelectedBorder,
      activeMatchColorOverviewRuler: opaque(searchMatchSelected, background),
    };
  }, [colors]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the seeded values are deliberately not dependencies.
  useEffect(() => {
    if (host.current == null) {
      return;
    }

    const xterm = new XTerm({
      // Unicode11Addon and LigaturesAddon both reach proposed API.
      allowProposedApi: true,
      fontSize: font.size,
      lineHeight: font.lineHeight,
      cursorStyle,
      cursorInactiveStyle,
      cursorBlink,
      macOptionIsMeta,
      scrollback,
      theme,
    });

    // DO NOT REORDER.
    const fit = new FitAddon();
    const search = new SearchAddon({ highlightLimit: LIMIT + 1 });
    for (const addon of [
      fit,
      search,
      new Unicode11Addon(),
      new WebLinksAddon((_event, uri) => window.open(uri, '_blank', 'noopener')),
      new ClipboardAddon(),
      new ClipboardShortcuts(),
      session,
    ]) {
      xterm.loadAddon(addon);
    }

    xterm.unicode.activeVersion = '11';
    xterm.open(host.current);

    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      xterm.loadAddon(webgl);
    } catch (error) {
      console.warn('terminal: WebGL unavailable, using the DOM renderer', error);
    }

    fit.fit();
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(host.current);
    setTerminal({ xterm, fit, search });
    // DO NOT REORDER.

    return () => {
      observer.disconnect();
      ligatures.current?.dispose();
      xterm.dispose();
      setTerminal(null);
    };
  }, [session]);

  useImperativeHandle<XTerm | null, XTerm | null>(ref, () => terminal?.xterm ?? null, [terminal]);

  useEffect(() => {
    if (terminal === null) {
      return;
    }

    // Canvas text never triggers a web font's download, so xterm would measure the fallback's cells for good.
    let live = true;
    const stack = monoFontStack(font.family);
    void document.fonts
      .load(`${font.size}px ${stack}`)
      .catch(() => [])
      .then(() => {
        if (live) {
          terminal.xterm.options.fontFamily = stack;
          terminal.xterm.options.fontSize = font.size;
          terminal.xterm.options.lineHeight = font.lineHeight;
          terminal.fit.fit();
        }
      });
    return () => {
      live = false;
    };
  }, [terminal, font.family, font.size, font.lineHeight]);

  useEffect(() => {
    if (terminal === null || !font.ligatures) {
      return;
    }

    const addon = new LigaturesAddon();
    terminal.xterm.loadAddon(addon);
    ligatures.current = addon;
    return () => {
      addon.dispose();
      ligatures.current = null;
    };
  }, [terminal, font.ligatures]);

  useEffect(() => {
    const element = terminal?.xterm.element;
    if (terminal === null || element === undefined || !copyOnSelect) {
      return;
    }

    // Xterm.onSelectionChange(...) does not differentiate between programmatic and mouse selections. This is necessary
    // for copy on select to work while search panel is open.
    //
    // Combines mousedown + onSelectionChange to prevent copying on middle mouse/scrollbar clicks.
    let changed = false;
    const listener = terminal.xterm.onSelectionChange(() => {
      changed = true;
    });

    const copy = () => {
      if (changed && terminal.xterm.hasSelection()) {
        void navigator.clipboard.writeText(terminal.xterm.getSelection());
      }
    };
    const select = () => {
      changed = false;
      document.addEventListener('mouseup', copy, { once: true });
    };
    element.addEventListener('mousedown', select);

    return () => {
      listener.dispose();
      element.removeEventListener('mousedown', select);
      document.removeEventListener('mouseup', copy);
    };
  }, [terminal, copyOnSelect]);

  useEffect(() => {
    if (terminal !== null) {
      terminal.xterm.options.theme = theme;
      terminal.xterm.options.cursorStyle = cursorStyle;
      terminal.xterm.options.cursorInactiveStyle = cursorInactiveStyle;
      terminal.xterm.options.cursorBlink = cursorBlink;
      terminal.xterm.options.macOptionIsMeta = macOptionIsMeta;
      terminal.xterm.options.scrollback = scrollback;
    }
  }, [terminal, theme, cursorStyle, cursorInactiveStyle, cursorBlink, macOptionIsMeta, scrollback]);

  // Opens the search bar on Cmd-F, or Ctrl-Shift-F where Ctrl-F belongs to the shell, seeded with the selected line.
  // TODO: Bind through a terminal command once commands have a terminal scope.
  function keydown(event: KeyboardEvent<HTMLElement>) {
    const chord =
      PLATFORM === 'mac'
        ? event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
        : event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey;
    if (terminal === null || !chord || event.key.toLowerCase() !== 'f') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const selection = terminal.xterm.getSelection();
    if (!finding && selection !== '' && !selection.includes('\n')) {
      setQuery((query) => ({ ...query, query: selection }));
    }
    setFinding(true);
    findField.current?.select();
  }

  return (
    <div className="relative h-full" onKeyDownCapture={keydown}>
      <div className="terminal-host h-full" ref={host} style={{ backgroundColor: theme.background }} />
      {finding && terminal !== null && (
        <TerminalSearchBar
          decorations={decorations}
          field={findField}
          initial={query}
          onClose={(query) => {
            setQuery(query);
            setFinding(false);
            terminal.xterm.focus();
          }}
          search={terminal.search}
        />
      )}
    </div>
  );
}

// Returns `color` laid over `background` as `#RRGGBB`, the only form xterm's decorations take.
function opaque(color: string, background: string): string {
  const [r, g, b, alpha] = channels(color);
  const under = channels(background);
  return `#${[r, g, b]
    .map((channel, index) =>
      Math.round(channel * alpha + (under[index] ?? 0) * (1 - alpha))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

// Returns the red, green, blue and alpha of a `#RGB[A]`, `#RRGGBB[AA]` or `rgb[a]()` color.
function channels(color: string): [number, number, number, number] {
  const hex = /^#([0-9a-f]+)$/i.exec(color)?.[1];
  if (hex !== undefined) {
    const full = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join('') : hex;
    const [r = 0, g = 0, b = 0, a = 255] = (full.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16));
    return [r, g, b, a / 255];
  }
  const [r = 0, g = 0, b = 0, a = 1] = (color.match(/[\d.]+/g) ?? []).map(Number);
  return [r, g, b, a];
}
