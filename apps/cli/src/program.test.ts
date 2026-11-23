import { afterEach, expect, test, vi } from 'vitest';
import { createProgram } from './program';

afterEach(() => {
  vi.restoreAllMocks();
});

test('hello greets the given name', async () => {
  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

  await createProgram().parseAsync(['hello', 'Joe'], { from: 'user' });

  expect(write).toHaveBeenCalledWith('Hello, Joe!\n');
});
