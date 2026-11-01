import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../src/components/accordion';

import { type ForcedPseudoClass, forcePseudoStates, Sheet, THEMES } from '../sheet.tsx';

type ItemSpec = {
  key: string;
  label: string;
  disabled?: boolean;
  forced?: readonly ForcedPseudoClass[];
};

const ITEMS: readonly ItemSpec[] = [
  { key: 'open', label: 'Open' },
  { key: 'closed', label: 'Closed' },
  { key: 'disabled', label: 'Disabled', disabled: true },
];

const PSEUDO_ITEMS: readonly ItemSpec[] = [
  { key: 'hover', label: 'Hover', forced: ['hover'] },
  { key: 'focus-visible', label: 'Focus visible', forced: ['focus', 'focus-visible'] },
];

test.each(THEMES)('accordion states (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <AccordionSheet items={ITEMS} open={['open']} />
    </Sheet>,
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`accordion-${theme}`);
});

test.each(THEMES)('accordion pseudo states (%s)', async (theme) => {
  await render(
    <Sheet theme={theme}>
      <AccordionSheet items={PSEUDO_ITEMS} open={[]} />
    </Sheet>,
  );

  await forcePseudoStates(
    PSEUDO_ITEMS.map((item) => ({
      selector: `[data-visual-state="${item.key}"] [data-slot="accordion-trigger"]`,
      pseudoClasses: item.forced ?? [],
    })),
  );

  await expect(page.getByTestId('sheet')).toMatchScreenshot(`accordion-pseudo-${theme}`);
});

function AccordionSheet({ items, open }: { items: readonly ItemSpec[]; open: readonly string[] }) {
  return (
    // 6px of slack, so the focus ring is not cropped.
    <div className="w-80 p-1.5">
      <Accordion multiple value={[...open]}>
        {items.map((item) => (
          <AccordionItem data-visual-state={item.key} disabled={item.disabled} key={item.key} value={item.key}>
            <AccordionTrigger>{item.label}</AccordionTrigger>
            <AccordionContent>
              <p className="text-text-2">A paragraph inside the {item.label.toLowerCase()} item.</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
