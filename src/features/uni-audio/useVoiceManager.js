import { useContext } from 'react';
import { VoiceContext } from './VoiceContext.js';

export function useVoiceManager() {
  const manager = useContext(VoiceContext);
  if (!manager) throw new Error('useVoiceManager deve ser usado dentro de VoiceProvider.');
  return manager;
}
