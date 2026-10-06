import { useState } from 'react';
import Button from '../../../components/ui/Button';
import { UniRingOrb, UNI_RING_ORB_STATES } from '../../../components/ui/UniRingOrb';
import { REALTIME_STATUS, summarizeRealtimeSession } from '../../../features/uni-voice-realtime/realtimeSessionModel.js';
import { REALTIME_IDLE_LIMIT_MS, useRealtimeVoiceSession } from '../../../features/uni-voice-realtime/useRealtimeVoiceSession.js';
import styles from './RealtimePrototypePage.module.css';

const STATUS_LABELS = Object.freeze({
  [REALTIME_STATUS.IDLE]: 'Parada',
  [REALTIME_STATUS.CONNECTING]: 'Conectando…',
  [REALTIME_STATUS.LISTENING]: 'Ouvindo',
  [REALTIME_STATUS.USER_SPEAKING]: 'Você está falando',
  [REALTIME_STATUS.THINKING]: 'A Uni está pensando',
  [REALTIME_STATUS.SPEAKING]: 'A Uni está falando',
  [REALTIME_STATUS.ENDED]: 'Encerrada',
  [REALTIME_STATUS.ERROR]: 'Erro',
});

const ORB_STATES = Object.freeze({
  [REALTIME_STATUS.CONNECTING]: UNI_RING_ORB_STATES.THINKING,
  [REALTIME_STATUS.LISTENING]: UNI_RING_ORB_STATES.LISTENING,
  [REALTIME_STATUS.USER_SPEAKING]: UNI_RING_ORB_STATES.LISTENING,
  [REALTIME_STATUS.THINKING]: UNI_RING_ORB_STATES.THINKING,
  [REALTIME_STATUS.SPEAKING]: UNI_RING_ORB_STATES.SPEAKING,
});

const EAGERNESS_OPTIONS = Object.freeze([
  { value: 'low', label: 'Espera mais (low)' },
  { value: 'medium', label: 'Equilibrado (medium)' },
  { value: 'auto', label: 'Padrão da OpenAI (auto)' },
  { value: 'high', label: 'Responde rápido (high)' },
]);

const END_REASONS = Object.freeze({
  user: 'Você encerrou a conversa.',
  idle: `A conversa foi encerrada depois de ${REALTIME_IDLE_LIMIT_MS / 1000} segundos sem ninguém falar.`,
});

function formatSeconds(ms) {
  if (ms === null) return '—';
  return `${(ms / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s`;
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function formatBrl(value) {
  if (value === null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export default function RealtimePrototypePage() {
  const session = useRealtimeVoiceSession();
  const [eagerness, setEagerness] = useState('low');
  const { state } = session;
  const summary = summarizeRealtimeSession(state, session.now);

  const isConnecting = state.status === REALTIME_STATUS.CONNECTING;
  const isActive = Boolean(ORB_STATES[state.status]) && !isConnecting;
  const canStart = !isActive && !isConnecting;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Protótipo DEV</p>
        <h1>Conversa contínua com a Uni</h1>
        <p className={styles.hint}>
          Toque em Começar e fale normalmente, com pausas. A Uni responde quando você termina e para de falar
          se você a interromper. Use fone na primeira vez e depois teste no viva-voz.
        </p>
      </header>

      <section className={styles.panel} aria-labelledby="realtime-control-title">
        <h2 id="realtime-control-title" className="uf-sr-only">Controle da conversa</h2>
        <div className={styles.stage}>
          <UniRingOrb
            size={160}
            state={ORB_STATES[state.status] ?? UNI_RING_ORB_STATES.IDLE}
            getVoiceStream={session.getLocalStream}
          />
          <p className={styles.status} role="status" aria-live="polite">
            {STATUS_LABELS[state.status] ?? state.status}
          </p>
        </div>

        <label className={styles.field} htmlFor="realtime-eagerness">
          <span>Quanto a Uni espera nas pausas</span>
          <select
            id="realtime-eagerness"
            value={eagerness}
            onChange={(event) => setEagerness(event.target.value)}
            disabled={!canStart}
          >
            {EAGERNESS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <div className={styles.actions}>
          {canStart ? (
            <Button onClick={() => session.start({ eagerness })}>Começar</Button>
          ) : (
            <Button variant="danger" onClick={() => session.stop('user')}>
              {isConnecting ? 'Cancelar' : 'Encerrar'}
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={session.markFalseInterruption}
            disabled={summary.falseInterruptions >= summary.interruptions}
          >
            A última interrupção foi eco
          </Button>
        </div>

        {state.status === REALTIME_STATUS.ENDED && END_REASONS[state.endReason] && (
          <p className={styles.notice} role="status">{END_REASONS[state.endReason]}</p>
        )}
        {state.error && <p className={styles.error} role="alert">{state.error}</p>}
      </section>

      <section className={styles.panel} aria-labelledby="realtime-metrics-title">
        <h2 id="realtime-metrics-title">Medição</h2>
        <dl className={styles.metrics}>
          <div><dt>Sessão aberta</dt><dd>{formatDuration(summary.sessionMs)}</dd></div>
          <div><dt>Respostas</dt><dd>{summary.turns}</dd></div>
          <div><dt>Espera até a Uni falar (p50)</dt><dd>{formatSeconds(summary.latencyP50Ms)}</dd></div>
          <div><dt>Espera até a Uni falar (p95)</dt><dd>{formatSeconds(summary.latencyP95Ms)}</dd></div>
          <div><dt>Interrupções</dt><dd>{summary.interruptions}</dd></div>
          <div><dt>Interrupções por eco</dt><dd>{summary.falseInterruptions}</dd></div>
          <div><dt>Custo estimado</dt><dd>{formatBrl(summary.costBrl)}</dd></div>
          <div><dt>Custo por minuto</dt><dd>{formatBrl(summary.costBrlPerMinute)}</dd></div>
        </dl>
        <p className={styles.hint}>
          A espera conta do momento em que o servidor decide que você terminou até a primeira palavra da Uni. O
          custo usa o preço do gpt-realtime-2.1-mini sem o desconto de cache e câmbio de R$ 5,50.
        </p>
      </section>

      <section className={styles.panel} aria-labelledby="realtime-transcript-title">
        <h2 id="realtime-transcript-title">Transcrição</h2>
        {state.transcript.length === 0 ? (
          <p className={styles.hint}>As falas aparecem aqui assim que a conversa começar.</p>
        ) : (
          <ol className={styles.transcript}>
            {state.transcript.map((entry, index) => (
              <li key={`${entry.itemId ?? 'item'}-${index}`} className={entry.role === 'uni' ? styles.uni : styles.user}>
                <strong>{entry.role === 'uni' ? 'Uni' : 'Você'}</strong>
                <span>{entry.text}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
