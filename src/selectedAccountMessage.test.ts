import { describe, expect, it } from 'vitest';
import { isSelectedAccountChangedMessage } from './selectedAccountMessage';

describe('isSelectedAccountChangedMessage', () => {
  it('accepts both Home account-change message shapes', () => {
    expect(isSelectedAccountChangedMessage({ action: 'SELECTED_ACCOUNT_CHANGED' })).toBe(true);
    expect(isSelectedAccountChangedMessage({ type: 'qortium:selected-account-changed' })).toBe(true);
  });

  it('rejects unrelated or malformed messages', () => {
    expect(isSelectedAccountChangedMessage({ action: 'THEME_CHANGED' })).toBe(false);
    expect(isSelectedAccountChangedMessage(null)).toBe(false);
    expect(isSelectedAccountChangedMessage('SELECTED_ACCOUNT_CHANGED')).toBe(false);
  });
});
