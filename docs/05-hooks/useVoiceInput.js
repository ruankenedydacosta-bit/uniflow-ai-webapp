import { useCallback, useRef, useState } from 'react';

/**
 * useVoiceInput — wrapper sobre a Web Speech API nativa do navegador
 * (SpeechRecognition). Sem dependência externa. Suporte real hoje é
 * Chrome/Edge (e Safari parcialmente) — em navegadores sem suporte,
 * `isSupported` volta `false` e o botão de voz do ChatInput deve ficar
 * oculto (é isso que ChatInput.jsx faz).
 *
 * @param {(transcript: string) => void} onResult - chamado com o texto final reconhecido
 */
export function useVoiceInput(onResult) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  const SpeechRecognitionImpl =
    typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  const isSupported = Boolean(SpeechRecognitionImpl);

  const start = useCallback(() => {
    if (!isSupported || listening) return;

    const recognition = new SpeechRecognitionImpl();
    recognition.lang = 'pt-BR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) onResult?.(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [isSupported, listening, onResult, SpeechRecognitionImpl]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return { isSupported, listening, start, stop };
}
