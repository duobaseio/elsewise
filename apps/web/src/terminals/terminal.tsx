import type { TerminalSessionId } from '@elsewise/frontend-plugin';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import { FitAddon } from '@xterm/addon-fit';
import { LigaturesAddon } from '@xterm/addon-ligatures';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import type { ITerminalAddon, ITheme, Terminal as XTerm } from '@xterm/xterm';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useActiveTheme } from '@/appearance/themes';
import { useCommandManager } from '@/command/command-manager';
import { terminalKeymap } from '@/command/keymap/keymap';
import { monoFontStack } from '@/settings/fonts';
import { useSettings } from '@/settings/settings';
import { TerminalContextMenu } from '@/terminals/context-menu/context-menu';
import { TerminalSearch } from '@/terminals/search/search-bar';
import { useTerminalManager } from '@/terminals/terminal-manager';

import '@xterm/xterm/css/xterm.css';
import './terminal.css';

/**
 * Shows `xterm`, which outlives the component, as the terminal of `session`.
 *
 * Without `session`, e.g. in the settings' preview, it has no find, context menu or command keys, and never becomes
 * the active terminal.
 */
export function Terminal({ xterm, session }: { xterm: XTerm; session?: TerminalSessionId }) {
  const host = useRef<HTMLDivElement>(null);
  const [terminal, setTerminal] = useState<{ xterm: XTerm; fit: FitAddon } | null>(null);
  const ligatures = useRef<LigaturesAddon>(null);
  const commands = useCommandManager();
  const terminals = useTerminalManager();
  const [keymap] = useState(() =>
    terminalKeymap(commands, () => (session === undefined ? null : terminals.get(session))),
  );

  const colors = useActiveTheme().terminal;
  const theme = useMemo<ITheme>(() => {
    const { selection, searchMatch, searchMatchSelected, searchMatchSelectedBorder, ...rest } = colors;
    return { ...rest, selectionBackground: selection };
  }, [colors]);
  const font = useSettings((settings) => settings.terminal.font);
  const cursorStyle = useSettings((settings) => settings.terminal.cursorStyle);
  const cursorInactiveStyle = cursorStyle === 'block' ? 'outline' : cursorStyle;
  const cursorBlink = useSettings((settings) => settings.terminal.cursorBlink);
  const copyOnSelect = useSettings((settings) => settings.terminal.copyOnSelect);
  const macOptionClickForcesSelection = useSettings((settings) => settings.terminal.macOptionClickForcesSelection);
  const macOptionIsMeta = useSettings((settings) => settings.terminal.macOptionIsMeta);
  const scrollback = useSettings((settings) => settings.terminal.scrollback);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the seeded values are deliberately not dependencies.
  useEffect(() => {
    if (host.current == null) {
      return;
    }

    if (!xterm.unicode.versions.includes('11')) {
      xterm.loadAddon(new Unicode11Addon());
    }
    xterm.unicode.activeVersion = '11';
    xterm.options.fontSize = font.size;
    xterm.options.lineHeight = font.lineHeight;
    xterm.options.cursorStyle = cursorStyle;
    xterm.options.cursorInactiveStyle = cursorInactiveStyle;
    xterm.options.cursorBlink = cursorBlink;
    xterm.options.macOptionClickForcesSelection = macOptionClickForcesSelection;
    xterm.options.macOptionIsMeta = macOptionIsMeta;
    xterm.options.scrollback = scrollback;
    xterm.options.theme = theme;

    // DO NOT REORDER.
    const fit = new FitAddon();
    const addons: ITerminalAddon[] = [
      fit,
      new WebLinksAddon((_event, uri) => window.open(uri, '_blank', 'noopener')),
      new ClipboardAddon(),
      ...(session === undefined ? [] : [keymap]),
    ];
    for (const addon of addons) {
      xterm.loadAddon(addon);
    }

    // Opening an open terminal does nothing, so a terminal shown before moves its element instead.
    if (xterm.element === undefined) {
      xterm.open(host.current);
    } else {
      host.current.appendChild(xterm.element);
    }

    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      xterm.loadAddon(webgl);
      addons.push(webgl);
    } catch (error) {
      console.warn('terminal: WebGL unavailable, using the DOM renderer', error);
    }

    // Fitting clears and repaints the canvas a frame later, causing flickers when fitting on every resize.
    fit.fit();
    let settle: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(settle);
      settle = setTimeout(() => fit.fit(), 100);
    });

    observer.observe(host.current);
    setTerminal({ xterm, fit });
    // DO NOT REORDER.

    const activate = () => {
      if (session !== undefined) {
        terminals.activate(session);
      }
    };
    xterm.textarea?.addEventListener('focus', activate);

    return () => {
      observer.disconnect();
      clearTimeout(settle);
      xterm.textarea?.removeEventListener('focus', activate);
      if (session !== undefined) {
        terminals.deactivate(session);
      }
      ligatures.current?.dispose();
      for (const addon of addons.reverse()) {
        addon.dispose();
      }
      setTerminal(null);
    };
  }, [xterm]);

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
    const select = (event: MouseEvent) => {
      if (event.button === 0) {
        changed = false;
        document.addEventListener('mouseup', copy, { once: true });
      }
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
      terminal.xterm.options.macOptionClickForcesSelection = macOptionClickForcesSelection;
      terminal.xterm.options.macOptionIsMeta = macOptionIsMeta;
      terminal.xterm.options.scrollback = scrollback;
    }
  }, [
    terminal,
    theme,
    cursorStyle,
    cursorInactiveStyle,
    cursorBlink,
    macOptionClickForcesSelection,
    macOptionIsMeta,
    scrollback,
  ]);

  return session === undefined ? (
    <div className="terminal-host h-full" ref={host} style={{ backgroundColor: theme.background }} />
  ) : (
    <div className="relative h-full">
      <TerminalContextMenu
        render={<div className="terminal-host h-full" ref={host} style={{ backgroundColor: theme.background }} />}
        session={session}
        terminal={terminal?.xterm ?? null}
      />
      <TerminalSearch terminal={terminal?.xterm ?? null} />
    </div>
  );
}
