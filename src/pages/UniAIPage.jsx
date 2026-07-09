import { useEffect, useRef, useState } from 'react';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import {
  contextItems,
  conversationMessages,
  createMessage,
  getLastUniMessage,
  getMockUniResponse,
  getPortugueseVoice,
  getSpeechRecognition,
  getVoiceFeedback,
  isProbablySafari,
  quickSuggestions,
  UniAIHero,
  UniChatPanel,
  UniContextPanel,
  UniQuickSuggestions,
} from './uni-ai';
import styles from './UniAIPage.module.css';

function UniAIPage() {
  const [messages, setMessages] = useState(conversationMessages);
  const [draftMessage, setDraftMessage] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceVolume, setVoiceVolume] = useState(0);
  const [hasAudioMeter, setHasAudioMeter] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceNotice, setVoiceNotice] = useState('');
  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioStreamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const finalTranscriptRef = useRef('');
  const shouldShowEmptyCaptureNoticeRef = useRef(false);
  const canSendMessage = draftMessage.trim().length > 0;
  const lastUniMessage = getLastUniMessage(messages);
  const voiceFeedback = getVoiceFeedback(voiceVolume, hasAudioMeter);

  useEffect(() => () => {
    recognitionRef.current?.abort?.();

    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
    audioContextRef.current?.close?.().catch?.(() => {});
    audioContextRef.current = null;

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  function sendMessage(content) {
    const trimmedContent = content.trim();

    if (!trimmedContent) return;

    setMessages((currentMessages) => [
      ...currentMessages,
      createMessage('user', trimmedContent),
      createMessage('uni', getMockUniResponse(trimmedContent)),
    ]);
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!canSendMessage) return;

    setVoiceNotice('');
    setInterimTranscript('');
    sendMessage(draftMessage);
    setDraftMessage('');
  }

  function handleSuggestionClick(suggestion) {
    setVoiceNotice('');
    setInterimTranscript('');
    sendMessage(suggestion);
  }

  async function startAudioMeter() {
    setVoiceVolume(0);
    setHasAudioMeter(false);

    if (typeof window === 'undefined' || isProbablySafari() || !navigator.mediaDevices?.getUserMedia) return;

    const AudioContext = window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 256;
      const samples = new Uint8Array(analyser.fftSize);
      source.connect(analyser);
      audioStreamRef.current = stream;
      audioContextRef.current = audioContext;
      setHasAudioMeter(true);

      function updateVolume() {
        analyser.getByteTimeDomainData(samples);

        const sum = samples.reduce((total, sample) => {
          const centeredSample = (sample - 128) / 128;
          return total + centeredSample * centeredSample;
        }, 0);
        const rms = Math.sqrt(sum / samples.length);

        setVoiceVolume(Math.min(rms * 6, 1));
        animationFrameRef.current = window.requestAnimationFrame(updateVolume);
      }

      updateVolume();
    } catch {
      setHasAudioMeter(false);
      setVoiceVolume(0);
    }
  }

  function stopAudioMeter() {
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
    audioContextRef.current?.close?.().catch?.(() => {});
    audioContextRef.current = null;
    setHasAudioMeter(false);
    setVoiceVolume(0);
  }

  function stopVoiceCapture() {
    shouldShowEmptyCaptureNoticeRef.current = false;
    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
    setIsListening(false);
    setInterimTranscript('');
    stopAudioMeter();
  }

  function startVoiceCapture() {
    if (isListening) {
      stopVoiceCapture();
      setVoiceNotice('Escuta encerrada. Você pode digitar ou falar novamente quando quiser.');
      return;
    }

    const SpeechRecognition = getSpeechRecognition();

    if (!SpeechRecognition) {
      setVoiceNotice('Seu navegador ainda não suporta captura de voz aqui. Você pode digitar sua pergunta para a Uni.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    finalTranscriptRef.current = '';
    shouldShowEmptyCaptureNoticeRef.current = true;
    setInterimTranscript('');
    setVoiceNotice('');
    recognition.lang = 'pt-BR';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceNotice('Ouvindo...');
    };

    recognition.onresult = (event) => {
      let partialTranscript = '';

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript ?? '';

        if (result?.isFinal) {
          finalTranscriptRef.current = `${finalTranscriptRef.current} ${transcript}`.trim();
        } else {
          partialTranscript = `${partialTranscript} ${transcript}`.trim();
        }
      }

      setInterimTranscript(partialTranscript);
    };

    recognition.onerror = () => {
      shouldShowEmptyCaptureNoticeRef.current = false;
      setVoiceNotice('Não consegui capturar sua fala agora. Se quiser, repita com calma ou digite sua pergunta.');
    };

    recognition.onend = () => {
      const finalTranscript = finalTranscriptRef.current.trim();

      if (finalTranscript) {
        sendMessage(finalTranscript);
        setVoiceNotice('Áudio captado.');
      } else if (shouldShowEmptyCaptureNoticeRef.current) {
        setVoiceNotice('Não captei uma pergunta completa. Se quiser, repita com calma.');
      }

      setIsListening(false);
      setInterimTranscript('');
      finalTranscriptRef.current = '';
      shouldShowEmptyCaptureNoticeRef.current = false;
      recognitionRef.current = null;
      stopAudioMeter();
    };

    startAudioMeter();

    try {
      recognition.start();
    } catch {
      stopAudioMeter();
      recognitionRef.current = null;
      shouldShowEmptyCaptureNoticeRef.current = false;
      setInterimTranscript('');
      setVoiceNotice('Não consegui iniciar a captura de voz agora. Você pode digitar sua pergunta para a Uni.');
    }
  }

  function speakLastResponse() {
    if (
      !lastUniMessage ||
      typeof window === 'undefined' ||
      !('speechSynthesis' in window) ||
      !window.SpeechSynthesisUtterance
    ) {
      setVoiceNotice('A leitura em voz alta ainda não está disponível neste navegador.');
      return;
    }

    const synthesis = window.speechSynthesis;
    synthesis.cancel();

    const utterance = new window.SpeechSynthesisUtterance(lastUniMessage.content);
    utterance.lang = 'pt-BR';

    function applyPortugueseVoice() {
      const portugueseVoice = getPortugueseVoice(synthesis.getVoices());

      if (portugueseVoice) {
        utterance.voice = portugueseVoice;
      }
    }

    applyPortugueseVoice();
    synthesis.onvoiceschanged = applyPortugueseVoice;
    utterance.onstart = () => {
      setIsSpeaking(true);
      setVoiceNotice('Falando...');
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      synthesis.onvoiceschanged = null;
      setVoiceNotice('');
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      synthesis.onvoiceschanged = null;
      setVoiceNotice('Não consegui reproduzir a resposta em voz agora.');
    };

    synthesis.speak(utterance);
  }

  return (
    <div className={styles.page}>
      <UniAIHero />

      <section className={styles.mainGrid} aria-label="Experiência principal da Uni AI">
        <UniChatPanel
          messages={messages}
          draftMessage={draftMessage}
          canSendMessage={canSendMessage}
          isListening={isListening}
          isSpeaking={isSpeaking}
          lastUniMessage={lastUniMessage}
          voiceNotice={voiceNotice}
          interimTranscript={interimTranscript}
          voiceFeedback={voiceFeedback}
          voiceVolume={voiceVolume}
          onDraftChange={setDraftMessage}
          onSubmit={handleSubmit}
          onStartVoiceCapture={startVoiceCapture}
          onSpeakLastResponse={speakLastResponse}
        />
        <UniContextPanel contextItems={contextItems} />
      </section>

      <UniQuickSuggestions suggestions={quickSuggestions} onSuggestionClick={handleSuggestionClick} />

      <Card variant="outline" padding="md" className={styles.safetyCard}>
        <Badge variant="secondary">Limite da experiência</Badge>
        <p>
          A Uni orienta e recomenda caminhos possíveis, mas as decisões finais continuam sendo suas. Esta tela ainda usa
          dados mockados; a IA real será conectada em uma etapa futura.
        </p>
      </Card>
    </div>
  );
}

export default UniAIPage;
