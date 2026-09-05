import { describe, expect, it } from 'vitest';
import {
  categoryDescription,
  categoryLabel,
  evaluatorRoleLabel,
  formatRuntimeLabel,
  publicizeTrustText,
  ratingSignedLabel,
  ratingVariantForCategory,
  roleNameForCategory,
} from './format';

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
    expect(categoryDescription('SUBJECT')).toBe(
      'Recognize this person as a known community member whose final standing can support minting and consensus weight.',
    );
    expect(categoryDescription('PLAYER')).toBe(
      'Trust this person to evaluate community members fairly through their ratings.',
    );
    expect(categoryDescription('TRAINER')).toBe(
      'Trust this person to explain the system accurately and help others use it responsibly.',
    );
    expect(categoryDescription('MANAGER')).toBe(
      'Trust this person to understand the platform and help shape how trust flows through the community.',
    );
  });

  it('returns an empty string for an unexpected wire value', () => {
    expect(categoryDescription('OWNER' as never)).toBe('');
  });
});

describe('ratingVariantForCategory', () => {
  it('is minter for SUBJECT and role for every other category', () => {
    expect(ratingVariantForCategory('SUBJECT')).toBe('minter');
    expect(ratingVariantForCategory('PLAYER')).toBe('role');
    expect(ratingVariantForCategory('TRAINER')).toBe('role');
    expect(ratingVariantForCategory('MANAGER')).toBe('role');
  });
});

describe('ratingSignedLabel (decomposed sign + magnitude, owner copy rule)', () => {
  it('renders Yes/No + confidence for the minter variant', () => {
    expect(ratingSignedLabel(1, 'minter')).toBe('Yes · Low (1)');
    expect(ratingSignedLabel(3, 'minter')).toBe('Yes · High (3)');
    expect(ratingSignedLabel(-4, 'minter')).toBe('No · Very high (-4)');
  });

  it('renders Positive/Negative + confidence for the role variant', () => {
    expect(ratingSignedLabel(2, 'role')).toBe('Positive · Medium (2)');
    expect(ratingSignedLabel(-1, 'role')).toBe('Negative · Low (-1)');
  });

  it('keeps the numeric value after the readable answer and degree', () => {
    expect(ratingSignedLabel(3, 'role')).toBe('Positive · High (3)');
    expect(ratingSignedLabel(3, 'role')).not.toMatch(/^\+?\d/);
  });
});

describe('evaluatorRoleLabel / roleNameForCategory', () => {
  it('evaluatorRoleLabel maps each rated category to the role one level up', () => {
    expect(evaluatorRoleLabel('SUBJECT')).toBe('Voter');
    expect(evaluatorRoleLabel('PLAYER')).toBe('Guide');
    expect(evaluatorRoleLabel('TRAINER')).toBe('Designer');
    // MANAGER (Designer) ratings count through the rater's own influence pool, not a separate role.
    expect(evaluatorRoleLabel('MANAGER')).toBeNull();
  });

  it('roleNameForCategory maps a role category to the role it grants (SUBJECT has none)', () => {
    expect(roleNameForCategory('PLAYER')).toBe('Voter');
    expect(roleNameForCategory('TRAINER')).toBe('Guide');
    expect(roleNameForCategory('MANAGER')).toBe('Designer');
    expect(roleNameForCategory('SUBJECT')).toBeNull();
  });
});

describe('publicizeTrustText', () => {
  it('renames wire category names to their public names in server prose', () => {
    expect(publicizeTrustText('SUBJECT threshold not met')).toBe('MINTER threshold not met');
    expect(publicizeTrustText('Requires Subject Gold level')).toBe('Requires Minter Gold level');
    expect(publicizeTrustText('MANAGER, TRAINER, PLAYER all apply')).toBe('DESIGNER, GUIDE, VOTER all apply');
  });

  it('leaves unrelated text untouched', () => {
    expect(publicizeTrustText('No category names here.')).toBe('No category names here.');
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
