import { usePreviewSize } from '@elsewise/components/components/settings';
import { useEffect, useRef } from 'react';
import { PreviewLayout } from '@/editor/layouts/preview-layout';
import type { Language } from '@/settings/languages';

export function Preview({ language }: { language: Language | undefined }) {
  const root = useRef<HTMLDivElement>(null);
  const setSize = usePreviewSize();

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new preview remounts the editor, so the observer must re-attach to the new nodes.
  useEffect(() => {
    let fitted = Number.NEGATIVE_INFINITY;
    const measure = () => {
      const el = root.current;
      const scroller = el?.querySelector<HTMLElement>('.cm-scroller');
      const content = scroller?.querySelector<HTMLElement>('.cm-content:not(.cm-lineWrapping)');
      const line = content?.querySelector<HTMLElement>('.cm-line');
      if (!el || !scroller || !content || !line) {
        return;
      }

      const left = content.getBoundingClientRect().left;
      const range = document.createRange();
      let right = left;
      for (const line of content.querySelectorAll('.cm-line')) {
        range.selectNodeContents(line);
        right = Math.max(right, range.getBoundingClientRect().right);
      }

      const gutters = scroller.querySelector<HTMLElement>('.cm-gutters')?.offsetWidth ?? 0;
      // The visual guides widen the content past its lines.
      const text = Math.max(right - left, Number.parseFloat(getComputedStyle(content).minWidth) || 0) + gutters;
      if (Math.abs(text - fitted) < 1) {
        return;
      }
      fitted = text;

      const padding = Number.parseFloat(getComputedStyle(line).paddingRight);
      const chrome = el.offsetWidth - scroller.clientWidth;
      setSize(Math.ceil(chrome + text + padding));
    };

    const observer = new ResizeObserver(measure);
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled || !root.current) {
        return;
      }
      for (const target of root.current.querySelectorAll('.cm-gutters, .cm-content')) {
        observer.observe(target);
      }
      measure();
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [setSize, language]);

  if (language === undefined) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-3">No preview for this language.</div>
    );
  }

  return (
    <div className="h-full" ref={root}>
      <PreviewLayout code={language.preview} key={language.path} relativePath={language.path} />
    </div>
  );
}
