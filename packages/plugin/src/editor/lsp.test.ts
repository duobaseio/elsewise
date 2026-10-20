import { LSPClient } from '@codemirror/lsp-client';
import { describe, expect, test } from 'vitest';
import { workspaceConfiguration } from './lsp.ts';

const SETTINGS = { python: { analysis: { typeCheckingMode: 'strict' } } };
const CLIENT = new LSPClient();

describe('workspaceConfiguration', () => {
  test('sends section at dotted path', () => {
    expect(
      workspaceConfiguration(SETTINGS)(CLIENT, { items: [{ section: 'python' }, { section: 'python.analysis' }] }),
    ).toEqual([SETTINGS.python, SETTINGS.python.analysis]);
  });

  test('sends whole settings for empty section', () => {
    expect(workspaceConfiguration(SETTINGS)(CLIENT, { items: [{ section: '' }, {}] })).toEqual([SETTINGS, SETTINGS]);
  });

  test('sends null for unknown section', () => {
    expect(
      workspaceConfiguration(SETTINGS)(CLIENT, {
        items: [{ section: 'gopls' }, { section: 'python.missing' }, { section: 'constructor' }],
      }),
    ).toEqual([null, null, null]);
  });
});
