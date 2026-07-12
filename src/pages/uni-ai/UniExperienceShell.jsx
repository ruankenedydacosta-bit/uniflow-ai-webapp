import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import UniAudioControls from './UniAudioControls';
import UniFinancialActionCard from './UniFinancialActionCard';
import UniInsightReport from './UniInsightReport';
import UniLiveContextPanel from './UniLiveContextPanel';
import UniMemoryInfluenceNotice from './UniMemoryInfluenceNotice';
import UniMemorySuggestionCard from './UniMemorySuggestionCard';
import UniRecentConversations from './UniRecentConversations';
import UniQuickSuggestions from './UniQuickSuggestions';
import UniSuggestionDrawer from './UniSuggestionDrawer';
import UniThinkingSequence from './UniThinkingSequence';
import UniVoiceStage from './UniVoiceStage';
import styles from '../UniAIPage.module.css';

function UniExperienceShell({
  experienceState,
  hasStarted,
  messages,
  contextItems,
  initialSuggestions,
  suggestions,
  report,
  draftMessage,
  canSendMessage,
  isListening,
  isThinking,
  isSpeaking,
  isMuted,
  voiceOutputMode,
  voiceOutputBusy,
  premiumVoiceSupported,
  isResponding,
  voiceVolume,
  voiceNotice,
  thinkingSteps,
  thinkingStepIndex,
  suggestionsOpen,
  textComposerOpen,
  onDraftChange,
  onSubmit,
  onStartVoiceCapture,
  onNewQuestion,
  onVoiceOutputModeChange,
  onSpeakBrowser,
  onSpeakPremium,
  onStopVoiceOutput,
  onToggleSuggestions,
  onSuggestionClick,
  onToggleTextComposer,
  onReportAction,
  financialConversation,
  onConfirmFinancialAction,
  onCorrectFinancialAction,
  onCancelFinancialAction,
  memoryInfluence,
  memorySuggestion,
  memoryStatus,
  memoryError,
  onMemorySuggestionChoice,
}) {
  const showFocusedFlow = isListening || isThinking;
  const showSideExperience = hasStarted && !showFocusedFlow;

  return (
    <section
      className={`${styles.experienceShell} ${showSideExperience ? styles.experienceShellWithSide : ''} ${
        showFocusedFlow ? styles.experienceShellFocused : ''
      }`}
    >
      <div className={styles.experienceMain}>
        <UniVoiceStage
          experienceState={experienceState}
          isListening={isListening}
          isSpeaking={isSpeaking}
          isMuted={isMuted}
          voiceVolume={voiceVolume}
          onStartVoiceCapture={onStartVoiceCapture}
        />

        {voiceNotice ? (
          <p className={styles.experienceNotice} role="status" aria-live="polite">
            {voiceNotice}
          </p>
        ) : null}

        {!hasStarted ? (
          <UniQuickSuggestions suggestions={initialSuggestions} onSuggestionClick={onSuggestionClick} />
        ) : null}

        <UniThinkingSequence active={isThinking} steps={thinkingSteps} activeIndex={thinkingStepIndex} />

        <UniMemoryInfluenceNotice influence={memoryInfluence} error={memoryError} />

        <UniFinancialActionCard
          conversation={financialConversation}
          onConfirm={onConfirmFinancialAction}
          onCorrect={onCorrectFinancialAction}
          onCancel={onCancelFinancialAction}
        />

        <UniMemorySuggestionCard
          suggestion={memorySuggestion}
          status={memoryStatus}
          onChoose={onMemorySuggestionChoice}
        />

        {!isThinking ? (
          <UniInsightReport report={report} onNewQuestion={onNewQuestion} onAction={onReportAction} />
        ) : null}

        <UniAudioControls
          hasResponse={Boolean(report)}
          mode={voiceOutputMode}
          isSpeaking={isSpeaking}
          isBusy={voiceOutputBusy}
          premiumSupported={premiumVoiceSupported}
          onModeChange={onVoiceOutputModeChange}
          onSpeakBrowser={onSpeakBrowser}
          onSpeakPremium={onSpeakPremium}
          onStop={onStopVoiceOutput}
        />

        {hasStarted ? (
          <div className={styles.secondaryControls}>
            <Button variant="ghost" size="sm" onClick={onToggleTextComposer} aria-expanded={textComposerOpen}>
              Digitar pergunta
            </Button>
            <UniSuggestionDrawer
              open={suggestionsOpen}
              suggestions={suggestions}
              onToggle={onToggleSuggestions}
              onSuggestionClick={onSuggestionClick}
            />
          </div>
        ) : null}

        {hasStarted && textComposerOpen ? (
          <form className={styles.secondaryComposer} aria-label="Enviar pergunta digitada para a Uni" onSubmit={onSubmit}>
            <Input
              fullWidth
              variant="glass"
              placeholder="Digite uma pergunta para a Uni..."
              aria-label="Digite uma pergunta para a Uni"
              value={draftMessage}
              onChange={(event) => onDraftChange(event.target.value)}
            />
            <Button type="submit" disabled={!canSendMessage}>
              Enviar
            </Button>
          </form>
        ) : null}
      </div>

      {showSideExperience ? (
        <div className={styles.experienceSide}>
          <UniLiveContextPanel contextItems={contextItems} isActive={Boolean(report)} isRecalculating={isResponding} />
          <UniRecentConversations messages={messages} visible={hasStarted} />
        </div>
      ) : null}
    </section>
  );
}

export default UniExperienceShell;
