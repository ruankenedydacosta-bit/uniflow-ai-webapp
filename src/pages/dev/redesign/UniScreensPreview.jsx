import { useState } from 'react';
import { REALTIME_STATUS } from '../../../features/uni-voice-realtime/realtimeSessionModel.js';
import SimplifiedBottomNavigation from '../../../features/simplified-app/SimplifiedBottomNavigation.jsx';
import SimplifiedVoiceMode from '../../../features/simplified-app/SimplifiedVoiceMode.jsx';
import appStyles from '../../../features/simplified-app/simplifiedApp.module.css';
import { resolveRealtimeVoiceModeView } from '../../../features/simplified-app/voiceModeState.js';
import ActionConfirmation from '../../../features/uni-chat/components/ActionConfirmation.jsx';
import ChatHeader from '../../../features/uni-chat/components/ChatHeader.jsx';
import ChatInput from '../../../features/uni-chat/components/ChatInput.jsx';
import MessageBubble from '../../../features/uni-chat/components/MessageBubble.jsx';
import chatStyles from '../../../features/uni-chat/UniChatPage.module.css';
import { buildConfirmationFromAction } from '../../../features/uni-chat/uniChatAdapter.js';
import { UniVoiceInputProvider } from '../../../features/uni-voice/index.js';

// Telas 02 (Conversa) e 03 (Voz) do handoff com dados de exemplo, para
// comparar em 390px sem sessão (épico #91, #88). Só em desenvolvimento.

const DRAFT = buildConfirmationFromAction({
  transactionType: 'expense',
  account: { name: 'Nubank · débito' },
  category: { name: 'Alimentação' },
  description: 'Padaria',
  amount: 42,
  date: '2026-10-07',
});

const MESSAGES = [
  { id: 'u1', from: 'user', type: 'text', text: 'Quanto gastei com alimentação este mês?' },
  {
    id: 'a1',
    from: 'uni',
    type: 'text',
    text: 'Em outubro você gastou **R$ 486** com alimentação. É 12% a mais que em setembro.',
  },
  { id: 'u2', from: 'user', type: 'text', text: 'Registra 42 na padaria, no débito do Nubank' },
  {
    id: 'a2',
    from: 'uni',
    type: 'confirmation',
    text: 'Registrei como rascunho. Confira os dados antes de confirmar.',
    confirmation: DRAFT,
  },
];

const VOICE_STATES = Object.freeze({
  ouvindo: {
    status: REALTIME_STATUS.USER_SPEAKING,
    transcript: 'gastei 42 na padaria',
    isUserSpeaking: true,
    hasReply: false,
    hasPendingDraft: false,
  },
  entendendo: {
    status: REALTIME_STATUS.THINKING,
    transcript: 'gastei 42 na padaria agora',
    isUserSpeaking: false,
    hasReply: false,
    hasPendingDraft: false,
  },
  rascunho: {
    status: REALTIME_STATUS.SPEAKING,
    transcript: 'gastei 42 na padaria agora',
    isUserSpeaking: false,
    hasReply: true,
    hasPendingDraft: true,
  },
});

export function UniConversationPreview() {
  const [value, setValue] = useState('');
  return (
    <UniVoiceInputProvider>
      <div className={appStyles.shell} data-simplified-app-shell>
        <div className={appStyles.shellSurface}>
          <div className={appStyles.shellTopRegion} />
          <main className={appStyles.mainContent} data-uni-chat="true">
            <div className={chatStyles.page}>
              <ChatHeader mode="pessoal" onHistory={() => {}} onNewChat={() => {}} showModeSelector={false} />
              <div className={chatStyles.body}>
                <div className={chatStyles.messages}>
                  {MESSAGES.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      onConfirmAction={() => {}}
                      onCancelAction={() => {}}
                      onEditAction={() => {}}
                    />
                  ))}
                </div>
              </div>
              <div className={chatStyles.footer}>
                <ChatInput value={value} onChange={setValue} onSend={() => setValue('')} />
              </div>
            </div>
          </main>
          <SimplifiedBottomNavigation />
        </div>
      </div>
    </UniVoiceInputProvider>
  );
}

export function UniVoicePreview({ state }) {
  const sample = VOICE_STATES[state] ?? VOICE_STATES.ouvindo;
  const response = sample.hasReply ? (
    <section className={appStyles.compactResponse} data-presentation="voice">
      <p className={appStyles.uniResponse}>Registrei como rascunho. Confira os dados antes de confirmar.</p>
      <ActionConfirmation
        data={{ ...DRAFT, rows: DRAFT.rows.filter((row) => row.key !== 'date') }}
        onConfirm={() => {}}
        onCancel={() => {}}
        onEdit={() => {}}
        appearance="glass"
      />
    </section>
  ) : null;

  return (
    <SimplifiedVoiceMode
      open
      view={resolveRealtimeVoiceModeView(sample.status, { hasPendingDraft: sample.hasPendingDraft })}
      response={response}
      transcript={sample.transcript}
      isUserSpeaking={sample.isUserSpeaking}
      hasReply={sample.hasReply}
      onAction={() => {}}
      onClose={() => {}}
      onWrite={() => {}}
      onOpenConversation={() => {}}
    />
  );
}
