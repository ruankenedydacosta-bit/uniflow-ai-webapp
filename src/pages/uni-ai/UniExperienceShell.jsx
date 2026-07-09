import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import UniAudioControls from './UniAudioControls';
import UniInsightReport from './UniInsightReport';
import UniLiveContextPanel from './UniLiveContextPanel';
import UniRecentConversations from './UniRecentConversations';
import UniSuggestionDrawer from './UniSuggestionDrawer';
import UniThinkingSequence from './UniThinkingSequence';
import UniTranscriptPanel from './UniTranscriptPanel';
import UniVoiceStage from './UniVoiceStage';
import styles from '../UniAIPage.module.css';

function UniExperienceShell({
  experienceState,
  hasStarted,
  messages,
  contextItems,
  suggestions,
  report,
  draftMessage,
  canSendMessage,
  isListening,
  isThinking,
  isSpeaking,
  isPaused,
  isMuted,
  isResponding,
  voiceVolume,
  interimTranscript,
  confirmedTranscript,
  voiceNotice,
  thinkingSteps,
  thinkingStepIndex,
  suggestionsOpen,
  textComposerOpen,
  onDraftChange,
  onSubmit,
  onStartVoiceCapture,
  onNewQuestion,
  onPauseAudio,
  onResumeAudio,
  onReplayAudio,
  onToggleMute,
  onToggleSuggestions,
  onSuggestionClick,
  onToggleTextComposer,
  onReportAction,
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

        <UniTranscriptPanel
          interimTranscript={interimTranscript}
          confirmedTranscript={confirmedTranscript}
          isListening={isListening}
        />

        <UniThinkingSequence active={isThinking} steps={thinkingSteps} activeIndex={thinkingStepIndex} />

        {!isThinking ? (
          <UniInsightReport report={report} onNewQuestion={onNewQuestion} onAction={onReportAction} />
        ) : null}

        <UniAudioControls
          hasResponse={Boolean(report)}
          isSpeaking={isSpeaking}
          isPaused={isPaused}
          isMuted={isMuted}
          onPause={onPauseAudio}
          onResume={onResumeAudio}
          onReplay={onReplayAudio}
          onToggleMute={onToggleMute}
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
