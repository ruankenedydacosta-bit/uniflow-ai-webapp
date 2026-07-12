import { useEffect, useRef, useState } from 'react';
import { useAccess } from '../app/AccessContext';
import { useSession } from '../app/SessionContext';
import { UNI_CONVERSATION_STATES, useUniConversation } from '../features/uni-conversation';
import { useConversationMemory } from '../features/uni-memory-integration';
import { useUniVoiceInput } from '../features/uni-voice';
import { useUniVoiceOutput, VOICE_OUTPUT_MODES } from '../features/uni-voice-output';
import { useAccounts, useCategories, useTransactions } from '../hooks';
import { executeConfirmedFinancialAction } from '../services/confirmedFinancialActionService.js';
import { isSupabaseConfigured } from '../services/supabaseClient.js';
import { fallbackAccountTypes, financialCrudMock } from './financeiro/financialCrud.mock.js';
import {
  EXPERIENCE_STATES,
  EXPERIENCE_TIMING,
  contextItems,
  contextualSuggestions,
  conversationMessages,
  createInsightReport,
  createMessage,
  getMockUniResponse,
  isProbablySafari,
  quickSuggestions,
  thinkingSteps,
  UniExperienceShell,
} from './uni-ai';
import styles from './UniAIPage.module.css';

function getLocalIsoDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function UniAIPage() {
  const { access } = useAccess();
  const { profile, workspace } = useSession();
  const financialFallback = access.currentWorkspace === 'personal'
    ? financialCrudMock.personal
    : financialCrudMock.business;
  const accountState = useAccounts({
    workspaceId: workspace?.id,
    fallbackAccounts: financialFallback.accounts,
    fallbackAccountTypes,
  });
  const categoryState = useCategories({
    workspaceId: workspace?.id,
    fallbackCategories: financialFallback.categories,
  });
  const transactionState = useTransactions({
    workspaceId: workspace?.id,
    fallbackTransactions: financialFallback.transactions,
  });
  const conversationMemory = useConversationMemory();
  const personalityProfileId = conversationMemory.preferredProfileId
    ?? profile?.uni_personality_profile
    ?? 'balanced';
  const voiceOutput = useUniVoiceOutput({ personalityProfileId });
  const financialConversation = useUniConversation({
    accounts: accountState.accounts,
    accountTypes: accountState.accountTypes,
    categories: categoryState.categories,
    executeAtomicAction: isSupabaseConfigured ? executeAtomicFinancialAction : null,
    saveAccount: accountState.saveAccount,
    saveTransaction: transactionState.saveTransaction,
    profileId: personalityProfileId,
    workspaceType: access.currentWorkspace,
    referenceDate: getLocalIsoDate(),
    resolveParsedMemory: conversationMemory.resolveParsed,
  });
  const [messages, setMessages] = useState(conversationMessages);
  const [draftMessage, setDraftMessage] = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  const [currentReport, setCurrentReport] = useState(null);
  const [voiceVolume, setVoiceVolume] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [thinkingStepIndex, setThinkingStepIndex] = useState(0);
  const [voiceNotice, setVoiceNotice] = useState('');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [textComposerOpen, setTextComposerOpen] = useState(false);
  const audioContextRef = useRef(null);
  const audioStreamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const thinkingTimersRef = useRef([]);
  const responseRevealTimerRef = useRef(null);
  const voiceInput = useUniVoiceInput({
    profileId: personalityProfileId,
    onBeforeStart: prepareVoiceCapture,
    onCaptureStart: startAudioMeter,
    onCaptureEnd: stopAudioMeter,
    onFinalTranscript: handleVoiceTranscript,
    onUnsupported: () => setTextComposerOpen(true),
  });
  const isListening = voiceInput.isListening;
  const hasPendingFinancialAction = [
    UNI_CONVERSATION_STATES.INTERPRETING,
    UNI_CONVERSATION_STATES.NEEDS_CLARIFICATION,
    UNI_CONVERSATION_STATES.AWAITING_CONFIRMATION,
    UNI_CONVERSATION_STATES.EXECUTING,
  ].includes(financialConversation.state.status);
  const canSendMessage = draftMessage.trim().length > 0 && !isThinking && !hasPendingFinancialAction;
  const experienceState = getExperienceState();

  async function executeAtomicFinancialAction(action) {
    const result = await executeConfirmedFinancialAction(action);

    if (!result.error && result.data) {
      await Promise.all([accountState.refresh(), transactionState.refresh()]);
    }
    return result;
  }

  useEffect(() => () => {
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    thinkingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    thinkingTimersRef.current = [];
    window.clearTimeout(responseRevealTimerRef.current);

    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
    audioContextRef.current?.close?.().catch?.(() => {});
    audioContextRef.current = null;

  }, []);

  function getExperienceState() {
    if (isListening) return EXPERIENCE_STATES.LISTENING;
    if (isThinking) return EXPERIENCE_STATES.THINKING;
    if (voiceOutput.isPlaying) return EXPERIENCE_STATES.SPEAKING;
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
      const report = createInsightReport(content, responseContent);

      setMessages((currentMessages) => [
        ...currentMessages,
        createMessage('uni', responseContent),
      ]);
      setCurrentReport(report);
      setIsThinking(false);
      setIsResponding(true);
      setThinkingStepIndex(0);
      thinkingTimersRef.current = [];

      window.clearTimeout(responseRevealTimerRef.current);
      responseRevealTimerRef.current = window.setTimeout(() => {
        setIsResponding(false);
      }, EXPERIENCE_TIMING.responseReveal);
    }, thinkingSteps.length * EXPERIENCE_TIMING.thinkingStep + 220);

    thinkingTimersRef.current.push(responseTimer);
  }

  function sendMessage(content, { allowFinancialAction = false } = {}) {
    const trimmedContent = content.trim();

    if (!trimmedContent || isThinking) return;

    voiceOutput.stop();
    setHasStarted(true);
    setCurrentReport(null);
    setIsResponding(false);

    setVoiceNotice('');
    setMessages((currentMessages) => [
      ...currentMessages,
      createMessage('user', trimmedContent),
    ]);

    if (allowFinancialAction) {
      const interpretation = financialConversation.interpret(trimmedContent);

      if (interpretation.handled) {
        setMessages((currentMessages) => [
          ...currentMessages,
          createMessage('uni', interpretation.response.text),
        ]);
        return;
      }
    }

    runThinkingSequence(trimmedContent);
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!canSendMessage) return;

    setVoiceNotice('');
    sendMessage(draftMessage, { allowFinancialAction: true });
    setDraftMessage('');
  }

  function handleSuggestionClick(suggestion) {
    const suggestionLabel = typeof suggestion === 'string' ? suggestion : suggestion.prompt ?? suggestion.label;

    setVoiceNotice('');
    setSuggestionsOpen(false);
    setTextComposerOpen(false);
    sendMessage(suggestionLabel);
  }

  function prepareVoiceCapture() {
    voiceOutput.stop();
    setHasStarted(true);
    setCurrentReport(null);
    setSuggestionsOpen(false);
    setTextComposerOpen(false);
    setVoiceNotice('');
  }

  function handleVoiceTranscript(transcript) {
    sendMessage(transcript, { allowFinancialAction: true });
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

  function handleVoiceOutputModeChange(mode) {
    voiceOutput.setMode(mode);
  }

  function handleSpeakBrowser() {
    voiceOutput.setMode(VOICE_OUTPUT_MODES.BROWSER);
    voiceOutput.speakBrowser(currentReport?.response);
  }

  function handleSpeakPremium() {
    voiceOutput.setMode(VOICE_OUTPUT_MODES.PREMIUM);
    voiceOutput.speakPremium(currentReport?.summary, {
      fallbackText: currentReport?.response,
    });
  }

  function handleNewQuestion() {
    voiceInput.reset();
    voiceOutput.stop();
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
    financialConversation.reset();
    conversationMemory.resetInteraction();
  }

  async function handleConfirmFinancialAction() {
    const completion = await financialConversation.confirm();
    if (!completion?.response) return;

    setMessages((currentMessages) => [
      ...currentMessages,
      createMessage('uni', completion.response.text),
    ]);
  }

  function handleCorrectFinancialAction(corrections) {
    const previousAction = financialConversation.state.action;
    const correction = financialConversation.correct(corrections);

    if (correction?.action) {
      conversationMemory.suggestFromCorrection({
        parsedResult: financialConversation.state.parsed,
        previousAction,
        correctedAction: correction.action,
        corrections,
      });
    }
  }

  function handleCancelFinancialAction() {
    const response = financialConversation.cancel();
    setMessages((currentMessages) => [
      ...currentMessages,
      createMessage('uni', response.text),
    ]);
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
        isSpeaking={voiceOutput.isPlaying}
        isMuted={voiceOutput.mode === VOICE_OUTPUT_MODES.OFF}
        voiceOutputMode={voiceOutput.mode}
        voiceOutputBusy={voiceOutput.isBusy}
        premiumVoiceSupported={voiceOutput.premiumSupported}
        isResponding={isResponding}
        voiceVolume={voiceVolume}
        voiceNotice={voiceOutput.message || voiceNotice || voiceInput.message}
        thinkingSteps={thinkingSteps}
        thinkingStepIndex={thinkingStepIndex}
        suggestionsOpen={suggestionsOpen}
        textComposerOpen={textComposerOpen}
        onDraftChange={setDraftMessage}
        onSubmit={handleSubmit}
        onStartVoiceCapture={voiceInput.toggle}
        onNewQuestion={handleNewQuestion}
        onVoiceOutputModeChange={handleVoiceOutputModeChange}
        onSpeakBrowser={handleSpeakBrowser}
        onSpeakPremium={handleSpeakPremium}
        onStopVoiceOutput={voiceOutput.stop}
        onToggleSuggestions={() => setSuggestionsOpen((currentValue) => !currentValue)}
        onSuggestionClick={handleSuggestionClick}
        onToggleTextComposer={() => setTextComposerOpen((currentValue) => !currentValue)}
        onReportAction={handleReportAction}
        financialConversation={financialConversation.state}
        onConfirmFinancialAction={handleConfirmFinancialAction}
        onCorrectFinancialAction={handleCorrectFinancialAction}
        onCancelFinancialAction={handleCancelFinancialAction}
        memoryInfluence={conversationMemory.influence}
        memorySuggestion={conversationMemory.pendingSuggestion}
        memoryStatus={conversationMemory.status}
        memoryError={conversationMemory.error}
        onMemorySuggestionChoice={conversationMemory.chooseSuggestion}
      />
    </div>
  );
}

export default UniAIPage;
