function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isSelectedAccountChangedMessage(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  return value.action === 'SELECTED_ACCOUNT_CHANGED' || value.type === 'qortium:selected-account-changed';
}
