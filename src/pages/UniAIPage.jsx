import { useEffect, useRef, useState } from 'react';
import {
  EXPERIENCE_STATES,
  EXPERIENCE_TIMING,
  contextItems,
  contextualSuggestions,
  conversationMessages,
  createInsightReport,
  createMessage,
  getMockUniResponse,
  getPortugueseVoice,
  getSpeechRecognition,
  isProbablySafari,
  quickSuggestions,
  thinkingSteps,
  UniExperienceShell,
} from './uni-ai';
import styles from './UniAIPage.module.css';

function UniAIPage() {
  const [messages, setMessages] = useState(conversationMessages);
  const [draftMessage, setDraftMessage] = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  const [currentReport, setCurrentReport] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [voiceVolume, setVoiceVolume] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [thinkingStepIndex, setThinkingStepIndex] = useState(0);
  const [voiceNotice, setVoiceNotice] = useState('');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [textComposerOpen, setTextComposerOpen] = useState(false);
  const recognitionRef = useRef(null);
  const activeUtteranceRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioStreamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const thinkingTimersRef = useRef([]);
  const responseRevealTimerRef = useRef(null);
  const autoSpeechTimerRef = useRef(null);
  const responseSequenceRef = useRef(0);
  const lastAutoSpokenReportRef = useRef(null);
  const mutedRef = useRef(false);
  const finalTranscriptRef = useRef('');
  const recognizedTranscriptRef = useRef('');
  const shouldShowEmptyCaptureNoticeRef = useRef(false);
  const canSendMessage = draftMessage.trim().length > 0 && !isThinking;
  const experienceState = getExperienceState();

  useEffect(() => {
    mutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => () => {
    recognitionRef.current?.abort?.();

    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    thinkingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    thinkingTimersRef.current = [];
    window.clearTimeout(responseRevealTimerRef.current);
    window.clearTimeout(autoSpeechTimerRef.current);

    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
    audioContextRef.current?.close?.().catch?.(() => {});
    audioContextRef.current = null;

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    activeUtteranceRef.current = null;
  }, []);

  function getExperienceState() {
    if (isListening) return EXPERIENCE_STATES.LISTENING;
    if (isThinking) return EXPERIENCE_STATES.THINKING;
    if (isSpeaking || isPaused) return EXPERIENCE_STATES.SPEAKING;
    if (currentReport) return EXPERIENCE_STATES.READY;
    return EXPERIENCE_STATES.IDLE;
  }

  function clearThinkingTimers() {
    thinkingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    thinkingTimersRef.current = [];
  }

  function runThinkingSequence(content) {
    clearThinkingTimers();
    setIsThinking(true);
    setIsResponding(false);
    setThinkingStepIndex(0);

    thinkingSteps.forEach((_, index) => {
      const timer = window.setTimeout(() => {
        setThinkingStepIndex(index);
      }, index * 520);

      thinkingTimersRef.current.push(timer);
    });

    const responseTimer = window.setTimeout(() => {
      const responseContent = getMockUniResponse(content);
      responseSequenceRef.current += 1;
      const report = {
        ...createInsightReport(content, responseContent),
        speechId: responseSequenceRef.current,
      };

      setMessages((currentMessages) => [
        ...currentMessages,
        createMessage('uni', responseContent),
      ]);
      setCurrentReport(report);
      setIsThinking(false);
      setIsResponding(true);
      setThinkingStepIndex(0);
      thinkingTimersRef.current = [];
      queueAutomaticSpeech(report.speechId, report.response);

      window.clearTimeout(responseRevealTimerRef.current);
      responseRevealTimerRef.current = window.setTimeout(() => {
        setIsResponding(false);
      }, EXPERIENCE_TIMING.responseReveal);
    }, thinkingSteps.length * EXPERIENCE_TIMING.thinkingStep + 220);

    thinkingTimersRef.current.push(responseTimer);
  }

  function stopSpeech() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.onvoiceschanged = null;
    }

    activeUtteranceRef.current = null;
    setIsSpeaking(false);
    setIsPaused(false);
    setVoiceNotice('');
  }

  function queueAutomaticSpeech(responseId, responseContent) {
    window.clearTimeout(autoSpeechTimerRef.current);

    if (!responseId || !responseContent || mutedRef.current) return;

    autoSpeechTimerRef.current = window.setTimeout(() => {
      if (mutedRef.current || lastAutoSpokenReportRef.current === responseId) return;

      lastAutoSpokenReportRef.current = responseId;
      speakResponse(responseContent, { automatic: true });
    }, 120);
  }

  function speakResponse(content, options = {}) {
    if (
      !content ||
      typeof window === 'undefined' ||
      !('speechSynthesis' in window) ||
      !window.SpeechSynthesisUtterance
    ) {
      if (!options.automatic) {
        setVoiceNotice('A leitura em voz alta ainda não está disponível neste navegador.');
      }
      return;
    }

    if (options.automatic && mutedRef.current) return;

    const synthesis = window.speechSynthesis;
    synthesis.cancel();
    synthesis.resume?.();
    synthesis.onvoiceschanged = null;
    setIsPaused(false);

    const utterance = new window.SpeechSynthesisUtterance(content);
    activeUtteranceRef.current = utterance;
    utterance.lang = 'pt-BR';
    let hasStartedSpeaking = false;

    function applyPortugueseVoice() {
      const portugueseVoice = getPortugueseVoice(synthesis.getVoices());

      if (portugueseVoice) {
        utterance.voice = portugueseVoice;
      }
    }

    function startSpeaking() {
      if (hasStartedSpeaking || activeUtteranceRef.current !== utterance) return;

      hasStartedSpeaking = true;
      applyPortugueseVoice();
      setIsSpeaking(true);
      setVoiceNotice('Uni falando a orientação...');
      synthesis.speak(utterance);
    }

    applyPortugueseVoice();
    synthesis.onvoiceschanged = () => {
      applyPortugueseVoice();
      startSpeaking();
    };
    utterance.onstart = () => {
      setIsSpeaking(true);
      setVoiceNotice('Uni falando a orientação...');
    };
    utterance.onend = () => {
      if (activeUtteranceRef.current !== utterance) return;

      activeUtteranceRef.current = null;
      setIsSpeaking(false);
      setIsPaused(false);
      synthesis.onvoiceschanged = null;
      setVoiceNotice('');
    };
    utterance.onerror = () => {
      if (activeUtteranceRef.current !== utterance) return;

      activeUtteranceRef.current = null;
      setIsSpeaking(false);
      setIsPaused(false);
      synthesis.onvoiceschanged = null;

      if (!options.automatic) {
        setVoiceNotice('Não consegui reproduzir a resposta em voz agora.');
      }
    };

    if (synthesis.getVoices().length > 0) {
      startSpeaking();
    } else {
      window.setTimeout(startSpeaking, 250);
    }
  }

  function sendMessage(content) {
    const trimmedContent = content.trim();

    if (!trimmedContent || isThinking) return;

    window.clearTimeout(autoSpeechTimerRef.current);
    stopSpeech();
    setHasStarted(true);
    setCurrentReport(null);
    setIsResponding(false);

    setVoiceNotice('');
    setMessages((currentMessages) => [
      ...currentMessages,
      createMessage('user', trimmedContent),
    ]);
    runThinkingSequence(trimmedContent);
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!canSendMessage) return;

    setVoiceNotice('');
    sendMessage(draftMessage);
    setDraftMessage('');
  }

  function handleSuggestionClick(suggestion) {
    const suggestionLabel = typeof suggestion === 'string' ? suggestion : suggestion.prompt ?? suggestion.label;

    setVoiceNotice('');
    setSuggestionsOpen(false);
    setTextComposerOpen(false);
    sendMessage(suggestionLabel);
  }

  async function startAudioMeter() {
    setVoiceVolume(0);

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
    setVoiceVolume(0);
  }

  function stopVoiceCapture() {
    shouldShowEmptyCaptureNoticeRef.current = false;
    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
    setIsListening(false);
    stopAudioMeter();
  }

  function startVoiceCapture() {
    if (isListening) {
      stopVoiceCapture();
      setVoiceNotice('Escuta encerrada. Você pode digitar ou falar novamente quando quiser.');
      return;
    }

    window.clearTimeout(autoSpeechTimerRef.current);
    stopSpeech();
    setHasStarted(true);
    setCurrentReport(null);
    setSuggestionsOpen(false);
    setTextComposerOpen(false);

    const SpeechRecognition = getSpeechRecognition();

    if (!SpeechRecognition) {
      setVoiceNotice('Seu navegador ainda não suporta captura de voz aqui. Você pode digitar sua pergunta para a Uni.');
      setTextComposerOpen(true);
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    finalTranscriptRef.current = '';
    recognizedTranscriptRef.current = '';
    shouldShowEmptyCaptureNoticeRef.current = true;
    setVoiceNotice('');
    recognition.lang = 'pt-BR';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceNotice('Ouvindo...');
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let partialTranscript = '';

      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript ?? '';

        if (result?.isFinal) {
          finalTranscript = `${finalTranscript} ${transcript}`.trim();
        } else {
          partialTranscript = `${partialTranscript} ${transcript}`.trim();
        }
      }

      const recognizedTranscript = `${finalTranscript} ${partialTranscript}`.trim();

      finalTranscriptRef.current = finalTranscript || recognizedTranscript;
      recognizedTranscriptRef.current = recognizedTranscript || finalTranscriptRef.current;
    };

    recognition.onerror = () => {
      shouldShowEmptyCaptureNoticeRef.current = false;
      setVoiceNotice('Não consegui capturar sua fala agora. Se quiser, repita com calma ou digite sua pergunta.');
    };

    recognition.onend = () => {
      const finalTranscript = (finalTranscriptRef.current || recognizedTranscriptRef.current).trim();

      if (finalTranscript) {
        sendMessage(finalTranscript);
        setVoiceNotice('Áudio captado. A Uni vai organizar isso com calma.');
      } else if (shouldShowEmptyCaptureNoticeRef.current) {
        setVoiceNotice('Não consegui ouvir tudo. Pode tentar novamente?');
      }

      setIsListening(false);
      finalTranscriptRef.current = '';
      recognizedTranscriptRef.current = '';
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
      setVoiceNotice('Não consegui iniciar a captura de voz agora. Você pode digitar sua pergunta para a Uni.');
    }
  }

  function pauseAudio() {
    stopSpeech();
    setVoiceNotice('');
  }

  function resumeAudio() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.resume();
    }

    setIsPaused(false);
    setIsSpeaking(true);
    setVoiceNotice('Uni continuando a explicação...');
  }

  function replayAudio() {
    speakResponse(currentReport?.response);
  }

  function toggleMute() {
    const nextMutedState = !isMuted;

    setIsMuted(nextMutedState);
    mutedRef.current = nextMutedState;

    if (nextMutedState) {
      lastAutoSpokenReportRef.current = currentReport?.speechId ?? lastAutoSpokenReportRef.current;
      stopSpeech();
      setVoiceNotice('Áudio automático silenciado.');
      return;
    }

    setVoiceNotice('Áudio automático ativado.');
  }

  function handleNewQuestion() {
    window.clearTimeout(autoSpeechTimerRef.current);
    stopSpeech();
    clearThinkingTimers();
    window.clearTimeout(responseRevealTimerRef.current);
    setCurrentReport(null);
    setVoiceNotice('');
    setIsThinking(false);
    setIsResponding(false);
    setHasStarted(false);
    setSuggestionsOpen(false);
    setTextComposerOpen(false);
    setDraftMessage('');
  }

  function handleReportAction(action) {
    setVoiceNotice(`${action} será conectado em uma próxima etapa. Por enquanto, posso continuar orientando por voz.`);
  }

  return (
    <div className={styles.page}>
      <UniExperienceShell
        experienceState={experienceState}
        hasStarted={hasStarted}
        messages={messages}
        contextItems={contextItems}
        initialSuggestions={contextualSuggestions}
        suggestions={quickSuggestions}
        report={currentReport}
        draftMessage={draftMessage}
        canSendMessage={canSendMessage}
        isListening={isListening}
        isThinking={isThinking}
        isSpeaking={isSpeaking}
        isPaused={isPaused}
        isMuted={isMuted}
        isResponding={isResponding}
        voiceVolume={voiceVolume}
        voiceNotice={voiceNotice}
        thinkingSteps={thinkingSteps}
        thinkingStepIndex={thinkingStepIndex}
        suggestionsOpen={suggestionsOpen}
        textComposerOpen={textComposerOpen}
        onDraftChange={setDraftMessage}
        onSubmit={handleSubmit}
        onStartVoiceCapture={startVoiceCapture}
        onNewQuestion={handleNewQuestion}
        onPauseAudio={pauseAudio}
        onResumeAudio={resumeAudio}
        onReplayAudio={replayAudio}
        onToggleMute={toggleMute}
        onToggleSuggestions={() => setSuggestionsOpen((currentValue) => !currentValue)}
        onSuggestionClick={handleSuggestionClick}
        onToggleTextComposer={() => setTextComposerOpen((currentValue) => !currentValue)}
        onReportAction={handleReportAction}
      />
    </div>
  );
}

export default UniAIPage;
