export const FINANCIAL_DATA_CHANGED_EVENT = 'uniflow:financial-data-changed';

export function notifyFinancialDataChanged(source = 'unknown') {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;

  window.dispatchEvent(new CustomEvent(FINANCIAL_DATA_CHANGED_EVENT, {
    detail: { source },
  }));
}
