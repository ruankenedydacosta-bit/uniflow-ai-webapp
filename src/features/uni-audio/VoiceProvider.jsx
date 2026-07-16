import { useEffect, useState } from 'react';
import { VoiceContext } from './VoiceContext.js';
import { createVoiceManager } from './VoiceManager.js';

export function VoiceProvider({ children, manager }) {
  const [voiceManager] = useState(() => manager ?? createVoiceManager());

  useEffect(() => () => voiceManager.dispose(), [voiceManager]);

  return (
    <VoiceContext.Provider value={voiceManager}>
      {children}
    </VoiceContext.Provider>
  );
}
