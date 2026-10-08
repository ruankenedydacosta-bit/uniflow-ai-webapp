// Tela 19 do redesign: o saldo de minutos de voz aparece onde é gasto. Na
// tela de voz, sempre; na Home, só com 5 minutos ou menos. O saldo vem de
// getMyVoiceBalance (voiceQuotaService.js); aqui só se decide o que mostrar.

export const VOICE_MINUTES_LOW_LIMIT = 5;

const RENEWAL_DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  timeZone: 'America/Sao_Paulo',
});

export function formatVoiceRenewalDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return RENEWAL_DATE_FORMATTER.format(date);
}

// Sem ciclo de minutos (sem assinatura, saldo indisponível), nada aparece e o
// servidor continua decidindo ao abrir a conversa. "Acabou" é saldo zero de
// verdade: meio minuto ainda abre uma conversa curta.
export function resolveVoiceMinutes(balance) {
  if (!balance || !(balance.secondsGranted > 0)) return null;
  const remainingSeconds = Math.max(0, Number(balance.remainingSeconds) || 0);
  const minutes = Math.floor(remainingSeconds / 60);
  const isOut = remainingSeconds <= 0;
  const renewsOn = formatVoiceRenewalDate(balance.cycleEndsAt);
  return {
    minutes,
    isOut,
    isLow: !isOut && minutes <= VOICE_MINUTES_LOW_LIMIT,
    renewsOn,
    cycleEndsAt: balance.cycleEndsAt ?? null,
  };
}

// Chip no topo da tela de voz, ao lado de Fechar.
export function describeVoiceMinutesChip(voiceMinutes) {
  if (!voiceMinutes || voiceMinutes.isOut) return null;
  const { minutes } = voiceMinutes;
  if (minutes === 0) {
    return { label: 'Menos de 1 min', title: 'Resta menos de 1 minuto de voz este mês', isLow: true };
  }
  return {
    label: `${minutes} min restantes`,
    title: minutes === 1 ? 'Resta 1 minuto de voz este mês' : `Restam ${minutes} minutos de voz este mês`,
    isLow: voiceMinutes.isLow,
  };
}

function renewalSentence(renewsOn) {
  return renewsOn ? `Eles renovam em ${renewsOn}.` : 'Eles renovam no início do próximo ciclo do plano.';
}

// Tela de voz sem minutos: o orb para e Escrever vira a ação principal.
export function describeVoiceMinutesOut(voiceMinutes) {
  return {
    status: 'Sem minutos de voz',
    title: 'Seus minutos de voz deste mês acabaram.',
    body: `${renewalSentence(voiceMinutes?.renewsOn)} Até lá, você pode escrever para a Uni.`,
  };
}

// Aviso da Home, abaixo do card da Uni. A chave muda quando o saldo zera ou o
// ciclo renova: quem dispensou "restam 3 minutos" vê de novo o "acabaram".
export function describeVoiceMinutesNotice(voiceMinutes) {
  if (!voiceMinutes || (!voiceMinutes.isOut && !voiceMinutes.isLow)) return null;
  const renewal = renewalSentence(voiceMinutes.renewsOn);
  const cycleKey = voiceMinutes.cycleEndsAt ?? 'sem-ciclo';
  if (voiceMinutes.isOut) {
    return {
      key: `${cycleKey}:acabou`,
      title: 'Seus minutos de voz acabaram',
      body: `${renewal} Até lá, você pode escrever para a Uni.`,
    };
  }
  const { minutes } = voiceMinutes;
  const title = minutes === 0
    ? 'Resta menos de 1 minuto de voz este mês'
    : minutes === 1
      ? 'Resta 1 minuto de voz este mês'
      : `Restam ${minutes} minutos de voz este mês`;
  return {
    key: `${cycleKey}:baixo`,
    title,
    body: `${renewal} Quando acabarem, você ainda pode escrever para a Uni.`,
  };
}

// "Entendi" vale por pessoa: o mesmo aparelho pode ter mais de uma conta.
// O storage pode faltar (aba anônima, cota); o aviso então só não fica salvo.
export const VOICE_MINUTES_NOTICE_STORAGE_PREFIX = 'uniflow.voice-minutes-notice.v1';

function getBrowserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function buildNoticeStorageKey(userId) {
  return `${VOICE_MINUTES_NOTICE_STORAGE_PREFIX}.${userId}`;
}

export function readDismissedVoiceMinutesNotice(userId, storage = getBrowserStorage()) {
  if (!userId || !storage) return null;
  try {
    return storage.getItem(buildNoticeStorageKey(userId));
  } catch {
    return null;
  }
}

export function writeDismissedVoiceMinutesNotice(userId, noticeKey, storage = getBrowserStorage()) {
  if (!userId || !noticeKey || !storage) return;
  try {
    storage.setItem(buildNoticeStorageKey(userId), noticeKey);
  } catch {
    // Sem storage, o aviso volta na próxima visita. Não bloqueia a Home.
  }
}
