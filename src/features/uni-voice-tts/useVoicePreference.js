import { useCallback, useState } from 'react';
import { readVoicePreferenceEnabled, writeVoicePreferenceEnabled } from './voicePreferenceStorage.js';

/**
 * ELEVEN2: hook fino sobre a preferencia local "Permitir voz nas respostas
 * da Uni". Nao decide nada sozinho sobre reproducao -- so expoe o valor e
 * um setter, para o chat e a tela de Configuracoes lerem/escreverem a
 * MESMA fonte unica.
 */
export function useVoicePreference() {
  const [enabled, setEnabledState] = useState(() => readVoicePreferenceEnabled());

  const setEnabled = useCallback((next) => {
    setEnabledState(next);
    writeVoicePreferenceEnabled(next);
  }, []);

  return { enabled, setEnabled };
}
