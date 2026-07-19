const SAFE_ERROR_CODES = new Set([
  'INVALID_ACCOUNT_REQUEST',
  'ACCOUNT_HAS_DEPENDENCIES',
  'CATEGORY_HAS_DEPENDENCIES',
  'INVALID_CATEGORY_REQUEST',
  'INVALID_TRANSACTION_REQUEST',
  'SUPABASE_NOT_CONFIGURED',
  'WORKSPACE_REQUIRED',
]);

export function getFinanceErrorMessage(error, fallbackMessage) {
  if (!error) return '';
  return SAFE_ERROR_CODES.has(error.code) ? error.message : fallbackMessage;
}
