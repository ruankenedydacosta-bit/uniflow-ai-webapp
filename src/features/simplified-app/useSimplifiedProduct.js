import { useContext } from 'react';
import { SimplifiedProductContext } from './SimplifiedProductContext.js';

export function useSimplifiedProduct() {
  const context = useContext(SimplifiedProductContext);
  if (!context) {
    throw new Error('useSimplifiedProduct deve ser usado dentro de SimplifiedProductProvider');
  }
  return context;
}

export function useOptionalSimplifiedProduct() {
  return useContext(SimplifiedProductContext);
}

