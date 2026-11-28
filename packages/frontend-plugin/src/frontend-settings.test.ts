import { describe, expect, test } from 'vitest';
import { FrontendSettings } from './frontend-settings';

describe('FrontendSettings', () => {
  test('prefixes branches with elsewise by default', () => {
    expect(FrontendSettings.parse({}).workspace.defaultBranchPrefix).toBe('elsewise/');
  });

  test('keeps empty default branch prefix', () => {
    expect(FrontendSettings.parse({ workspace: { defaultBranchPrefix: '' } }).workspace.defaultBranchPrefix).toBe('');
  });

  test('activates tab on left after close by default', () => {
    expect(FrontendSettings.parse({}).workspace.closeActivation).toBe('left');
  });

  test('shows tab tooltips by default', () => {
    expect(FrontendSettings.parse({}).workspace.tabTooltips).toBe(true);
  });

  test('prefixes folders by default', () => {
    expect(FrontendSettings.parse({}).workspace.uniqueTabNames).toBe(true);
  });

  test('disables unsaved badges by default', () => {
    expect(FrontendSettings.parse({}).workspace.unsavedBadges).toBe(false);
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
