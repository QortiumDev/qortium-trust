import { describe, expect, it } from 'vitest';
import { categoryDescription, categoryLabel, formatRuntimeLabel } from './format';

describe('categoryLabel', () => {
  it('maps wire category values to their display labels', () => {
    expect(categoryLabel('SUBJECT')).toBe('Minters');
    expect(categoryLabel('PLAYER')).toBe('Voters');
    expect(categoryLabel('TRAINER')).toBe('Guides');
    expect(categoryLabel('MANAGER')).toBe('Designers');
  });

  it('title-cases any unexpected wire value the API might return', () => {
    expect(categoryLabel('OWNER' as never)).toBe('Owner');
  });
});

describe('categoryDescription', () => {
  it('returns the role description for each trust category', () => {
    expect(categoryDescription('SUBJECT')).toBe('Trust this account as a block minter.');
    expect(categoryDescription('PLAYER')).toBe('Trust this account to rate accounts.');
    expect(categoryDescription('TRAINER')).toBe('Trust this account to explain the trust network.');
    expect(categoryDescription('MANAGER')).toBe('Trust this account for governance votes.');
  });

  it('returns an empty string for an unexpected wire value', () => {
    expect(categoryDescription('OWNER' as never)).toBe('');
  });
});

describe('formatRuntimeLabel', () => {
  it('maps Home runtime tokens to a single friendly label', () => {
    expect(formatRuntimeLabel('QORTIUM_HOME_ELECTRON')).toBe('Qortium Home');
    expect(formatRuntimeLabel('QORTIUM_HOME_ANDROID')).toBe('Qortium Home');
    expect(formatRuntimeLabel('BROWSER_DEV')).toBe('Browser dev');
  });

  it('falls back to Loading when no runtime is known yet', () => {
    expect(formatRuntimeLabel(undefined)).toBe('Loading');
    expect(formatRuntimeLabel('')).toBe('Loading');
  });

  it('surfaces an unrecognized runtime verbatim', () => {
    expect(formatRuntimeLabel('SOME_FUTURE_UI')).toBe('SOME_FUTURE_UI');
  });
});
