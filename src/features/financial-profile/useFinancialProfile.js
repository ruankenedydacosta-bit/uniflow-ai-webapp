import { useContext } from 'react';
import FinancialProfileContext from './FinancialProfileContext.js';

export function useFinancialProfile() {
  const context = useContext(FinancialProfileContext);

  if (!context) {
    throw new Error('useFinancialProfile deve ser usado dentro de FinancialProfileProvider.');
  }

  return context;
}
