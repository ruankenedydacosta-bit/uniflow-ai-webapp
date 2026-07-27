import { useContext } from 'react';
import { UniVoiceInputContext } from './UniVoiceInputContext.js';

export function useSharedUniVoiceInput() {
  const context = useContext(UniVoiceInputContext);
  if (!context) {
    throw new Error('useSharedUniVoiceInput deve ser usado dentro de UniVoiceInputProvider');
  }
  return context;
}
