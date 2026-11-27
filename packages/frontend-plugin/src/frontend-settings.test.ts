import { describe, expect, test } from 'vitest';
import { FrontendSettings } from './frontend-settings';

describe('FrontendSettings', () => {
  test('activates tab on left after close by default', () => {
    expect(FrontendSettings.parse({}).workspace.closeActivation).toBe('left');
  });

  test('keeps valid close activation', () => {
    expect(FrontendSettings.parse({ workspace: { closeActivation: 'recent' } }).workspace.closeActivation).toBe(
      'recent',
    );
  });

  test('falls back for invalid close activation', () => {
    expect(FrontendSettings.parse({ workspace: { closeActivation: 'up' } }).workspace.closeActivation).toBe('left');
  });
});
