import { openSearchPanel } from '@codemirror/search';
import { EditorView } from '@codemirror/view';
import { DEFAULT_SETTINGS } from '@elsewise/bridge';
import { DEFAULT_COMMANDS, EDITOR_DOCUMENT } from '@elsewise/plugin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { AppearanceManager } from '@/appearance/appearance-manager';
import { resolveActiveTheme } from '@/appearance/themes';
import { CommandManager, CommandManagerContext } from '@/command/command-manager';
import { EditorManager, EditorManagerContext } from '@/editor/editor-manager';
import { SplitLayout, type SplitLayoutProps } from '@/editor/layouts/split-layout';
import { LanguageServers, LanguageServersContext } from '@/editor/lsp/language-servers';
import { settingsQuery } from '@/settings/settings';
import { SettingsPanelManager } from '@/settings/settings-panel-manager';
import { TerminalManager } from '@/terminal/terminal-manager';
import { memoryRouter } from '../../../test/commands';

const BASE = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'].join('\n');
// Changes `beta` on line 2 and deletes `delta`.
const CODE = ['alpha', 'BETA', 'gamma', 'epsilon'].join('\n');

// Renders a `SplitLayout` with `props` in the app's contexts, and returns its sides' views and a way to render it
// again.
async function mount(props: Partial<SplitLayoutProps>, editor = new EditorManager()) {
  const client = new QueryClient();
  client.setQueryData(settingsQuery.queryKey, DEFAULT_SETTINGS);
  const commands = new CommandManager({
    appearance: new AppearanceManager(
      'light',
      resolveActiveTheme([], { source: 'elsewise', name: 'elsewise' }, 'light'),
    ),
    editor,
    router: memoryRouter(),
    settings: new SettingsPanelManager(),
    terminal: new TerminalManager(),
  });
  const servers = new LanguageServers(editor);
  const session = { current: null };
  const ratio = { current: 0.5 };
  const tree = (next: Partial<SplitLayoutProps>) => (
    <QueryClientProvider client={client}>
      <EditorManagerContext value={editor}>
        <CommandManagerContext value={commands}>
          <LanguageServersContext value={servers}>
            <div style={{ height: 200 }}>
              <SplitLayout
                relativePath="main.txt"
                base={{ source: { type: 'blob' }, code: BASE }}
                target={{ source: { type: 'workingTree' }, code: CODE }}
                extensions={[]}
                session={session}
                ratio={ratio}
                {...next}
              />
            </div>
          </LanguageServersContext>
        </CommandManagerContext>
      </EditorManagerContext>
    </QueryClientProvider>
  );
  const screen = await render(tree(props));
  const side = (name: 'a' | 'b') => () => {
    const element = screen.container.querySelector<HTMLElement>(`.cm-merge-${name}`);
    const found = element === null ? null : EditorView.findFromDOM(element);
    if (found === null) {
      throw new Error(`missing ${name} side`);
    }
    return found;
  };
  await expect.poll(() => screen.container.querySelector('.cm-merge-b')).not.toBeNull();
  // Until they first measure, on the next frame, the sides guess their line height, and then scroll to keep the top line
  // in place.
  await Promise.all(
    [side('a')(), side('b')()].map(
      (view) => new Promise<void>((resolve) => view.requestMeasure({ read: () => resolve() })),
    ),
  );

  return {
    base: side('a'),
    target: side('b'),
    commands,
    rerender: (next: Partial<SplitLayoutProps>) => screen.rerender(tree(next)),
  };
}

// Returns the revert buttons in `view`'s gutter, which CodeMirror hides from accessibility queries.
function reverts(view: EditorView): Element[] {
  return [...view.dom.querySelectorAll('.cm-revertGutter [aria-label="Revert change"]')];
}

// Returns the number of changed lines that `view` shows.
function changedLines(view: EditorView): number {
  return view.dom.querySelectorAll('.cm-changedLine').length;
}

describe('SplitLayout', () => {
  test('shows base beside target', async () => {
    const { base, target } = await mount({});

    expect(base().state.doc.toString()).toBe(BASE);
    expect(target().state.doc.toString()).toBe(CODE);
    expect(base().dom.getBoundingClientRect().right).toBeLessThanOrEqual(target().dom.getBoundingClientRect().left);
  });

  test('marks changed lines on both sides', async () => {
    const { base, target } = await mount({});

    await expect.poll(() => changedLines(target())).toBe(1);
    expect(changedLines(base())).toBe(2);
  });

  test('describes sides to plugins', async () => {
    const editor = new EditorManager();
    // Puts the document's layout into the content's `data-layout`, or `loading` while it is null.
    editor.addExtensions([
      EditorView.contentAttributes.compute([EDITOR_DOCUMENT], (state) => {
        const layout = state.facet(EDITOR_DOCUMENT)?.layout;
        return {
          'data-layout': layout === undefined ? 'loading' : layout.type === 'split' ? layout.side : layout.type,
        };
      }),
    ]);
    const { base, target } = await mount({}, editor);

    await expect.poll(() => base().contentDOM.dataset.layout).toBe('base');
    expect(target().contentDOM.dataset.layout).toBe('target');
  });

  test('edits target but not blob base', async () => {
    const { base, target, commands } = await mount({});
    base().dispatch({ selection: { anchor: 0 } });
    target().dispatch({ selection: { anchor: 0 } });

    commands.run(DEFAULT_COMMANDS.editor.edit.deleteLine, base());
    commands.run(DEFAULT_COMMANDS.editor.edit.deleteLine, target());

    expect(base().state.doc.toString()).toBe(BASE);
    expect(target().state.doc.toString()).toBe(CODE.slice('alpha\n'.length));
  });

  test('keeps two blobs read-only', async () => {
    const { target, commands } = await mount({ target: { source: { type: 'blob' }, code: CODE } });
    target().dispatch({ selection: { anchor: 0 } });

    commands.run(DEFAULT_COMMANDS.editor.edit.deleteLine, target());

    expect(target().state.doc.toString()).toBe(CODE);
  });

  test('reverts change into working tree', async () => {
    const { target } = await mount({});
    await expect.poll(() => reverts(target())).toHaveLength(2);

    await userEvent.click(reverts(target())[0] as Element);

    expect(target().state.doc.line(2).text).toBe('beta');
  });

  test('keeps change on right-click of revert', async () => {
    const { target } = await mount({});
    await expect.poll(() => reverts(target())).toHaveLength(2);

    await userEvent.click(reverts(target())[0] as Element, { button: 'right' });

    expect(target().state.doc.line(2).text).toBe('BETA');
  });

  test('reverts deletion into working tree', async () => {
    const { target } = await mount({});
    await expect.poll(() => reverts(target())).toHaveLength(2);

    await userEvent.click(reverts(target())[1] as Element);

    expect(target().state.doc.toString()).toBe(['alpha', 'BETA', 'gamma', 'delta', 'epsilon'].join('\n'));
  });

  test('unmounts revert button of reverted chunk', async () => {
    const { target } = await mount({});
    await expect.poll(() => reverts(target())).toHaveLength(2);
    const container = reverts(target())[1].closest('.cm-revert') as HTMLElement;

    await userEvent.click(reverts(target())[1] as Element);

    await expect.poll(() => reverts(target())).toHaveLength(1);
    await expect.poll(() => container.childElementCount).toBe(0);
  });

  test('offers revert in target gutter before line numbers', async () => {
    const { target } = await mount({});
    await expect.poll(() => reverts(target())).toHaveLength(2);

    const numbers = target().dom.querySelector('.cm-lineNumbers') as Element;
    for (const button of reverts(target())) {
      expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(numbers.getBoundingClientRect().left);
    }
  });

  test('names revert in tooltip', async () => {
    const { target } = await mount({});
    await expect.poll(() => reverts(target())).toHaveLength(2);

    await userEvent.hover(reverts(target())[0] as Element);

    await expect.element(page.getByText('Revert change')).toBeVisible();
  });

  test('offers no revert into blob', async () => {
    const { base, target } = await mount({ target: { source: { type: 'blob' }, code: CODE } });
    await expect.poll(() => changedLines(target())).toBe(1);

    expect([...reverts(base()), ...reverts(target())]).toEqual([]);
  });

  test('scrolls sides together', async () => {
    const long = Array.from({ length: 200 }, (_, line) => `line ${line}`).join('\n');
    const { base, target } = await mount({
      base: { source: { type: 'blob' }, code: long },
      target: { source: { type: 'workingTree' }, code: long },
    });
    expect(target().scrollDOM.scrollHeight).toBeGreaterThan(target().scrollDOM.clientHeight);

    target().scrollDOM.scrollTop = 500;

    await expect.poll(() => base().scrollDOM.scrollTop).toBe(500);
  });

  test('scrolls both sides by wheels on next frame', async () => {
    const long = Array.from({ length: 200 }, (_, line) => `line ${line}`).join('\n');
    const { base, target } = await mount({
      base: { source: { type: 'blob' }, code: long },
      target: { source: { type: 'workingTree' }, code: long },
    });

    const scrolled = target().scrollDOM.dispatchEvent(
      new WheelEvent('wheel', { deltaY: 100, cancelable: true, bubbles: true }),
    );
    target().scrollDOM.dispatchEvent(new WheelEvent('wheel', { deltaY: 200, cancelable: true, bubbles: true }));
    expect(scrolled).toBe(false);
    expect(target().scrollDOM.scrollTop).toBe(0);
    await new Promise(requestAnimationFrame);

    expect(target().scrollDOM.scrollTop).toBe(300);
    expect(base().scrollDOM.scrollTop).toBe(300);
  });

  test('scrolls by screens from wheel in pages', async () => {
    const long = Array.from({ length: 200 }, (_, line) => `line ${line}`).join('\n');
    const { base, target } = await mount({
      base: { source: { type: 'blob' }, code: long },
      target: { source: { type: 'workingTree' }, code: long },
    });

    target().scrollDOM.dispatchEvent(
      new WheelEvent('wheel', { deltaY: 1, deltaMode: WheelEvent.DOM_DELTA_PAGE, cancelable: true, bubbles: true }),
    );
    await new Promise(requestAnimationFrame);

    expect(target().scrollDOM.scrollTop).toBe(target().scrollDOM.clientHeight);
    expect(base().scrollDOM.scrollTop).toBe(target().scrollDOM.scrollTop);
  });

  test('leaves pinch to browser', async () => {
    const long = Array.from({ length: 200 }, (_, line) => `line ${line}`).join('\n');
    const { target } = await mount({
      base: { source: { type: 'blob' }, code: long },
      target: { source: { type: 'workingTree' }, code: long },
    });

    const handled = !target().scrollDOM.dispatchEvent(
      new WheelEvent('wheel', { deltaY: 10, ctrlKey: true, cancelable: true, bubbles: true }),
    );

    expect(handled).toBe(false);
    expect(target().scrollDOM.scrollTop).toBe(0);
  });

  test('sizes scrollbar thumb to visible part and moves it with scroll', async () => {
    // Short enough for the thumb to be larger than its least height.
    const long = Array.from({ length: 40 }, (_, line) => `line ${line}`).join('\n');
    const { target } = await mount({
      base: { source: { type: 'blob' }, code: long },
      target: { source: { type: 'workingTree' }, code: long },
    });
    const { scrollDOM } = target();
    const track = () => target().dom.querySelector('.cm-scrollbar')?.getBoundingClientRect() ?? new DOMRect();
    const thumb = () => target().dom.querySelector('.cm-scrollbar-thumb')?.getBoundingClientRect() ?? new DOMRect();
    await expect.poll(() => thumb().height).toBeGreaterThan(0);
    expect(thumb().height).toBeCloseTo((track().height * scrollDOM.clientHeight) / scrollDOM.scrollHeight, 0);

    scrollDOM.scrollTop = 500;

    const room = track().height - thumb().height;
    const range = scrollDOM.scrollHeight - scrollDOM.clientHeight;
    await expect.poll(() => thumb().top - track().top).toBeCloseTo((500 / range) * room, 0);
  });

  test('scrolls both sides by dragging scrollbar thumb', async () => {
    const long = Array.from({ length: 200 }, (_, line) => `line ${line}`).join('\n');
    const { base, target } = await mount({
      base: { source: { type: 'blob' }, code: long },
      target: { source: { type: 'workingTree' }, code: long },
    });
    const { scrollDOM } = target();
    const thumb = () => target().dom.querySelector<HTMLElement>('.cm-scrollbar-thumb') as HTMLElement;
    const track = () => (target().dom.querySelector('.cm-scrollbar') as HTMLElement).getBoundingClientRect();
    await expect.poll(() => thumb()?.getBoundingClientRect().height ?? 0).toBeGreaterThan(0);
    const y = thumb().getBoundingClientRect().top + 2;
    const room = track().height - thumb().getBoundingClientRect().height;
    const range = scrollDOM.scrollHeight - scrollDOM.clientHeight;

    thumb().dispatchEvent(new PointerEvent('pointerdown', { clientY: y, button: 0, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: y + 20 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientY: y + 20 }));

    expect(scrollDOM.scrollTop).toBeCloseTo((20 / room) * range, 0);
    await expect.poll(() => base().scrollDOM.scrollTop).toBe(scrollDOM.scrollTop);
  });

  test('scrolls both sides by wheel over scrollbar', async () => {
    const long = Array.from({ length: 200 }, (_, line) => `line ${line}`).join('\n');
    const { base, target } = await mount({
      base: { source: { type: 'blob' }, code: long },
      target: { source: { type: 'workingTree' }, code: long },
    });
    const track = () => target().dom.querySelector<HTMLElement>('.cm-scrollbar') as HTMLElement;
    await expect.poll(() => track()?.getBoundingClientRect().height ?? 0).toBeGreaterThan(0);

    track().dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true, bubbles: true }));
    await new Promise(requestAnimationFrame);

    expect(target().scrollDOM.scrollTop).toBe(100);
    expect(base().scrollDOM.scrollTop).toBe(100);
  });

  test('pages by clicking scrollbar track below thumb', async () => {
    const long = Array.from({ length: 200 }, (_, line) => `line ${line}`).join('\n');
    const { base, target } = await mount({
      base: { source: { type: 'blob' }, code: long },
      target: { source: { type: 'workingTree' }, code: long },
    });
    const { scrollDOM } = target();
    const track = () => target().dom.querySelector<HTMLElement>('.cm-scrollbar') as HTMLElement;
    await expect.poll(() => track()?.getBoundingClientRect().height ?? 0).toBeGreaterThan(0);

    const y = track().getBoundingClientRect().bottom - 2;
    track().dispatchEvent(new PointerEvent('pointerdown', { clientY: y, button: 0, bubbles: true }));

    expect(scrollDOM.scrollTop).toBe(scrollDOM.clientHeight);
    await expect.poll(() => base().scrollDOM.scrollTop).toBe(scrollDOM.scrollTop);
  });

  test('keeps rows level with search bar on one side', async () => {
    const long = Array.from({ length: 200 }, (_, line) => `line ${line}`).join('\n');
    const { base, target } = await mount({
      base: { source: { type: 'blob' }, code: long },
      target: { source: { type: 'workingTree' }, code: long },
    });
    openSearchPanel(base());
    await expect.poll(() => base().dom.querySelector('.cm-panels-top')?.childElementCount ?? 0).toBeGreaterThan(0);

    target().scrollDOM.scrollTop = 500;

    const line = target().state.doc.lineAt(target().lineBlockAtHeight(560).from).number;
    const top = (view: EditorView) => view.coordsAtPos(view.state.doc.line(line).from)?.top;
    await expect.poll(() => top(base())).toBe(top(target()));
  });

  test('levels rows when search bar opens on one side', async () => {
    const long = Array.from({ length: 200 }, (_, line) => `line ${line}`).join('\n');
    const { base, target } = await mount({
      base: { source: { type: 'blob' }, code: long },
      target: { source: { type: 'workingTree' }, code: long },
    });
    target().scrollDOM.scrollTop = 500;
    await expect.poll(() => base().scrollDOM.scrollTop).toBe(500);

    openSearchPanel(base());

    const line = target().state.doc.lineAt(target().lineBlockAtHeight(560).from).number;
    const top = (view: EditorView) => view.coordsAtPos(view.state.doc.line(line).from)?.top;
    await expect.poll(() => base().dom.querySelector('.cm-panels-top')?.childElementCount ?? 0).toBeGreaterThan(0);
    expect(top(target())).toBeDefined();
    await expect.poll(() => top(base())).toBe(top(target()));
  });

  test('hides scrollbar markers of base', async () => {
    const { base, target } = await mount({});

    const display = (view: EditorView) => {
      const markers = view.dom.querySelector('.cm-scrollbar-markers');
      return markers === null ? null : getComputedStyle(markers).display;
    };
    expect(display(base())).toBe('none');
    expect(display(target())).not.toBe('none');
  });

  test('resizes sides by dragging line between them', async () => {
    const { base, target } = await mount({});
    const width = () => base().dom.getBoundingClientRect().width + target().dom.getBoundingClientRect().width;
    const left = base().dom.getBoundingClientRect().left;
    const handle = document.querySelector('[data-slot="split-handle"]') as HTMLElement;

    handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: left + width() / 2, button: 0, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: left + width() * 0.3 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: left + width() * 0.3 }));

    await expect.poll(() => base().dom.getBoundingClientRect().width).toBeCloseTo(width() * 0.3, -1);
  });

  test('keeps sides wide enough to read', async () => {
    const { base } = await mount({});
    const left = base().dom.getBoundingClientRect().left;
    const handle = document.querySelector('[data-slot="split-handle"]') as HTMLElement;

    handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: left + 300, button: 0, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: left + 10 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: left + 10 }));

    await expect.poll(() => base().dom.getBoundingClientRect().width).toBeCloseTo(240, -1);
  });

  test('resets sides by double-clicking line between them', async () => {
    const { base, target } = await mount({ ratio: { current: 0.3 } });
    await expect
      .poll(() => base().dom.getBoundingClientRect().width)
      .toBeLessThan(target().dom.getBoundingClientRect().width);

    await userEvent.dblClick(page.elementLocator(document.querySelector('[data-slot="split-handle"]') as HTMLElement));

    await expect
      .poll(() => base().dom.getBoundingClientRect().width)
      .toBeCloseTo(target().dom.getBoundingClientRect().width, -1);
  });

  test('splits evenly when too narrow for both sides', async () => {
    const { base, target } = await mount({ ratio: { current: 0.3 } });
    const handle = document.querySelector('[data-slot="split-handle"]') as HTMLElement;
    const frame = handle.parentElement?.parentElement as HTMLElement;
    frame.style.width = '400px';

    await userEvent.dblClick(page.elementLocator(handle));

    await expect
      .poll(() => base().dom.getBoundingClientRect().width)
      .toBeCloseTo(target().dom.getBoundingClientRect().width, -1);
  });

  test('leaves revert buttons beside line clickable', async () => {
    const { target } = await mount({});
    await expect.poll(() => target().dom.querySelector('.cm-revert')).not.toBeNull();
    const revert = (target().dom.querySelector('.cm-revert') as HTMLElement).getBoundingClientRect();

    const hit = document.elementFromPoint(revert.left + 1, revert.top + revert.height / 2);

    expect(hit?.closest('.cm-revert')).not.toBeNull();
  });

  test('opens search bar on one side', async () => {
    const { base, target } = await mount({});

    openSearchPanel(base());

    await expect.poll(() => base().dom.querySelector('.cm-panels-top')?.childElementCount ?? 0).toBeGreaterThan(0);
    expect(target().dom.querySelector('.cm-panels-top')?.childElementCount ?? 0).toBe(0);
  });

  test('finds in base by keyboard', async () => {
    const { base } = await mount({});

    await userEvent.click(base().contentDOM);
    await userEvent.keyboard('{Meta>}f{/Meta}');
    await userEvent.keyboard('gamma');

    await expect.poll(() => base().dom.querySelector('.cm-panels-top')?.textContent).toContain('1/1');
  });

  test('replaces base in place', async () => {
    const { base, target, rerender } = await mount({});
    await expect.poll(() => changedLines(target())).toBe(1);
    const shown = base();

    await rerender({ base: { source: { type: 'blob' }, code: CODE } });

    await expect.poll(() => changedLines(target())).toBe(0);
    expect(base()).toBe(shown);
  });

  test('rebuilds on target change', async () => {
    const { target, rerender } = await mount({});
    const shown = target();

    await rerender({ target: { source: { type: 'workingTree' }, code: `${CODE}\n` } });

    await expect.poll(() => target()).not.toBe(shown);
    expect(target().state.doc.toString()).toBe(`${CODE}\n`);
  });

  test('keeps CRLF base on mount', async () => {
    const replaced = vi.fn();
    await mount({
      base: { source: { type: 'blob' }, code: BASE.replaceAll('\n', '\r\n') },
      target: { source: { type: 'workingTree' }, code: CODE.replaceAll('\n', '\r\n') },
      extensions: EditorView.updateListener.of((update) => {
        if (update.docChanged && update.view.dom.classList.contains('cm-merge-a')) {
          replaced();
        }
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(replaced).not.toHaveBeenCalled();
  });
});
