import { EditorSelection, EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { DockviewApi } from 'dockview-react';
import { useEffect, useRef } from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { ApplicationManagerContext } from '@/application-context';
import { scroll, scrollbarsKeepFocus, scrollKeepsPosition } from '@/editor/scroll';
import { WorkspaceDock } from '@/routes/_shell/$daemon/$project/$workspace/route';
import { builtInApplication } from '../../test/commands';
import { addFile, FILE } from '../../test/dock';
import { stubComponents } from '../../test/dock-stubs';

const DOC = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join('\n');

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

// Opens `DOC` in an editor 200px high, with `extensions`.
function open(extensions: Extension = []): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc: DOC, extensions: [EditorView.theme({ '&': { height: '200px' } }), extensions] }),
    parent: document.body,
  });
  views.push(view);
  return view;
}

// Returns the range of `text` in `DOC`.
function range(text: string) {
  const from = DOC.indexOf(text);
  return EditorSelection.range(from, from + text.length);
}

// Returns how far `pos` is from the middle of `view`, in pixels.
function offCenter(view: EditorView, pos: number): number {
  const bounds = view.scrollDOM.getBoundingClientRect();
  const coords = view.coordsAtPos(pos);
  if (coords === null) {
    throw new Error('not drawn');
  }
  return Math.abs((coords.top + coords.bottom) / 2 - (bounds.top + bounds.height / 2));
}

describe('scroll', () => {
  test('centers range below editor', () => {
    const view = open();

    view.dispatch({ effects: scroll(range('line 100'), view) });

    expect(offCenter(view, range('line 100').from)).toBeLessThan(10);
  });

  test('centers range above editor', () => {
    const view = open();
    view.dispatch({ effects: EditorView.scrollIntoView(DOC.length) });

    view.dispatch({ effects: scroll(range('line 100'), view) });

    expect(offCenter(view, range('line 100').from)).toBeLessThan(10);
  });

  test('centers range cut off at bottom', () => {
    const view = open();
    const bounds = view.scrollDOM.getBoundingClientRect();
    const cut = view.lineBlockAtHeight(bounds.height - 4);

    view.dispatch({ effects: scroll(EditorSelection.range(cut.from, cut.to), view) });

    expect(offCenter(view, cut.from)).toBeLessThan(10);
  });

  test('ignores visible range', () => {
    const view = open();

    view.dispatch({ effects: scroll(range('line 3'), view) });

    expect(view.scrollDOM.scrollTop).toBe(0);
  });
});

describe('scrollbarsKeepFocus', () => {
  // Presses `view`'s scroller at `x` and `y` from its top left, and returns whether the press kept its default.
  function press(view: EditorView, x: number, y: number): boolean {
    const { left, top } = view.scrollDOM.getBoundingClientRect();
    return view.scrollDOM.dispatchEvent(
      new MouseEvent('mousedown', { clientX: left + x, clientY: top + y, bubbles: true, cancelable: true }),
    );
  }

  test('prevents press on vertical scrollbar', () => {
    const view = open(scrollbarsKeepFocus());
    const { scrollDOM } = view;

    expect(press(view, scrollDOM.clientWidth, 10)).toBe(false);
  });

  test('prevents press on horizontal scrollbar', () => {
    const view = open(scrollbarsKeepFocus());
    const { scrollDOM } = view;

    expect(press(view, 10, scrollDOM.clientHeight)).toBe(false);
  });

  test('lets press on scroller through', () => {
    const view = open(scrollbarsKeepFocus());

    expect(press(view, 10, 10)).toBe(true);
  });
});

describe('scrollKeepsPosition', () => {
  const settled = () => new Promise((resolve) => setTimeout(resolve, 100));

  function position(view: EditorView) {
    return { top: view.scrollDOM.scrollTop, left: view.scrollDOM.scrollLeft };
  }

  // Opens a document wider and higher than its editor, scrolled both ways, and returns it with its host and position.
  async function scrolled() {
    const host = document.createElement('div');
    document.body.append(host);
    const view = new EditorView({
      doc: DOC.replaceAll('line', 'line '.repeat(100)),
      extensions: [EditorView.theme({ '&': { height: '200px', width: '300px' } }), scrollKeepsPosition()],
      parent: host,
    });
    views.push(view);
    view.scrollDOM.scrollTo(120, 900);
    await settled();
    expect(view.scrollDOM.scrollTop).toBeGreaterThan(0);
    return { host, view, before: position(view) };
  }

  test('keeps position of editor put back in document', async () => {
    const { host, view, before } = await scrolled();

    host.remove();
    await settled();
    document.body.append(host);

    expect(position(view)).toEqual(before);
    await settled();
    expect(position(view)).toEqual(before);
    host.remove();
  });

  test('keeps position of editor moved in document', async () => {
    const { host, view, before } = await scrolled();
    const other = document.createElement('div');
    document.body.append(other);

    other.append(view.dom);

    expect(position(view)).toEqual(before);
    host.remove();
    other.remove();
  });

  test('keeps position of editor put back hidden', async () => {
    const { host, view, before } = await scrolled();

    host.remove();
    host.style.display = 'none';
    document.body.append(host);
    await settled();
    host.style.display = '';

    await expect.poll(() => position(view)).toEqual(before);
    host.remove();
  });

  test('keeps position scrolled to after it was put back', async () => {
    const { host, view } = await scrolled();
    host.remove();
    document.body.append(host);

    view.scrollDOM.scrollTo(0, 300);
    await settled();
    host.remove();
    document.body.append(host);

    expect(position(view)).toEqual({ top: 300, left: 0 });
    host.remove();
  });

  // Mounts a dock whose file and another are editors of a long document in one group, and returns it with the
  // file's editor, scrolled.
  async function dock() {
    const application = builtInApplication({
      panelComponents: stubComponents({
        file: {
          panel: () => {
            const host = useRef<HTMLDivElement>(null);
            useEffect(() => {
              const view = new EditorView({
                doc: DOC,
                extensions: [EditorView.theme({ '&': { height: '100%' } }), scrollKeepsPosition()],
                parent: host.current ?? undefined,
              });
              return () => view.destroy();
            }, []);
            return <div ref={host} className="h-full" />;
          },
        },
      }),
    });
    let ready: DockviewApi | undefined;
    await render(
      <ApplicationManagerContext value={application}>
        <div style={{ width: 1100, height: 400 }}>
          <WorkspaceDock
            onDockviewReady={(dockview) => {
              addFile(dockview);
              dockview.addPanel({
                id: 'file:other.ts',
                component: 'file',
                params: { path: 'other.ts' },
                position: { referencePanel: FILE.id },
                inactive: true,
              });
              ready = dockview;
            }}
          />
        </div>
      </ApplicationManagerContext>,
    );
    await expect.poll(() => document.querySelector('.cm-editor')).not.toBeNull();
    const view = EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement);
    if (ready === undefined || view === null) {
      throw new Error('dock not ready');
    }

    view.scrollDOM.scrollTo(0, 900);
    await settled();
    expect(view.scrollDOM.scrollTop).toBeGreaterThan(0);
    return { dockview: ready, view, before: position(view) };
  }

  test('keeps position of editor in tab switched from and back to', async () => {
    const { dockview, view, before } = await dock();

    dockview.getPanel('file:other.ts')?.api.setActive();
    await settled();
    expect(view.dom.isConnected).toBe(false);
    dockview.getPanel(FILE.id)?.api.setActive();

    expect(position(view)).toEqual(before);
    await settled();
    expect(position(view)).toEqual(before);
  });

  test('keeps position of editor in tab moved to another group', async () => {
    const { dockview, view, before } = await dock();
    const panel = dockview.getPanel(FILE.id);

    panel?.api.moveTo({ group: panel.group, position: 'bottom' });

    expect(dockview.groups.filter((group) => group.panels.some((other) => other.id.startsWith('file:')))).toHaveLength(
      2,
    );
    await settled();
    expect(position(view)).toEqual(before);
  });
});
