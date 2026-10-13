// Registro determinístico de IDs de mensagens do chat (msg-N), sem colisão
// com mensagens RESTAURADAS (histórico de localStorage/Supabase).
//
// Por que existe: nextId() antigo era um contador de módulo que recomeçava a
// cada reload -- com o histórico restaurado (mensagens restauradas preservam
// os IDs originais via client_message_id), um contador reiniciado podia gerar
// o MESMO id de uma mensagem restaurada (ex.: msg-7), e duas mensagens com a
// mesma chave se confundiam na tela e na persistência.
//
// Solução (sem Date.now/Math.random, 100% determinística):
// 1. todo id gerado é msg-N com N monotonicamente crescente;
// 2. mensagens restauradas são RESERVADAS (reserveMessageIds) em todo ponto
//    de restauração -- IDs reservados nunca são reutilizados e elevam o
//    piso do contador;
// 3. assim, um id novo nunca coincide com um id restaurado, em qualquer
//    ordem de restauração, em qualquer reload.
//
// Reserva é idempotente e nunca lança (lista vazia/objetos sem id/ids de
// outros formatos como uuid do banco são ignorados).
const MSG_ID_PATTERN = /^msg-(\d+)$/;

let nextNumber = 1;
const reservedNumbers = new Set();

function parseMessageNumber(id) {
  if (typeof id !== 'string') return null;
  const match = MSG_ID_PATTERN.exec(id);
  if (!match) return null;
  return Number(match[1]);
}

export function reserveMessageIds(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return;
  for (const message of messages) {
    const number = parseMessageNumber(message?.id);
    if (number == null) continue;
    reservedNumbers.add(number);
    if (number >= nextNumber) nextNumber = number + 1;
  }
}

export function nextMessageId() {
  while (reservedNumbers.has(nextNumber)) nextNumber += 1;
  const id = `msg-${nextNumber}`;
  nextNumber += 1;
  return id;
}

// Apenas para testes: volta ao estado inicial (reload de página simulado).
export function resetMessageIdRegistry() {
  nextNumber = 1;
  reservedNumbers.clear();
}
