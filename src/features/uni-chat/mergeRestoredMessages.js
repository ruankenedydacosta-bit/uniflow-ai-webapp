// BUG 1 (Sprint 4, Bloco 4.0): estratégia explícita de identidade para o
// merge entre mensagens já em tela (locais/otimistas) e mensagens
// restauradas do Supabase na hidratação de uma conversa.
//
// Causa raiz do bug antigo: o merge comparava
// `msg.clientMessageId ?? msg.dbId ?? msg.id`, mas `dbToMessage` nunca
// preenchia `clientMessageId` -- então mensagens locais caíam no
// fallback `id` ('msg-N') enquanto mensagens vindas do banco caíam no
// fallback `dbId` (uuid), e as duas identidades nunca coincidiam. O
// histórico inteiro era concatenado de novo a cada hidratação.
//
// Estratégia de identidade (nesta ordem, primeira que existir vence):
// 1. clientMessageId -- id estável definido pelo cliente, sobrevive ao
//    round-trip local -> Supabase -> local (client_message_id na tabela).
// 2. id -- fallback para mensagens que nunca tiveram clientMessageId
//    setado explicitamente (mensagens locais antigas); como
//    `messageToDb` grava `client_message_id: msg.clientMessageId || msg.id`,
//    `dbToMessage` agora preenche `clientMessageId` com esse mesmo valor,
//    então local.id e restaurada.clientMessageId sempre coincidem.
// 3. dbId -- último recurso, só relevante para mensagens que nunca
//    tiveram id de cliente algum (não deveria acontecer no fluxo atual).
export function messageIdentity(msg) {
  return msg?.clientMessageId ?? msg?.id ?? msg?.dbId ?? null;
}

// Funde `loadedMessages` (restauradas do Supabase) em `prev` (mensagens já
// presentes no estado, locais e/ou já restauradas antes), sem duplicar
// nenhuma mensagem já identificável em `prev`, e sem descartar mensagens
// locais ainda não persistidas (ex.: otimistas em voo).
//
// BUG REAL (chaves duplicadas, causa raiz #2 -- defesa em profundidade): o
// dedup anterior só comparava `loadedMessages` contra `prev`, nunca contra
// SI MESMO. Se o banco já contém duas linhas com o mesmo client_message_id
// (produzidas antes da correção em uniChatDataService.saveMessages, ou por
// qualquer outra causa futura), `loadedMessages` chega aqui com duas
// entradas de MESMA identidade -- ambas passavam no filtro (nenhuma delas
// está em `prevIds`) e as duas eram anexadas ao array final, causando duas
// entradas com o mesmo `id` numa única renderização (React "duplicate key").
// Agora `loadedMessages` também é deduplicado internamente ANTES de
// comparar com `prev` -- garante unicidade real da entidade mensagem
// independentemente do estado do banco.
// HOTFIX FINAL (chaves duplicadas ainda chegando ao render): barreira final
// de segurança, aplicada IMEDIATAMENTE ANTES do `.map()` que gera as
// `<MessageBubble key={message.id}>` -- independente de qualquer causa
// upstream (histórico antigo já contaminado no banco antes da correção de
// `saveMessages`, uma origem futura de dados que ainda não passe por
// `mergeRestoredMessages`, etc.), o array efetivamente renderizado NUNCA
// pode conter duas entradas com a mesma identidade. Reaproveita
// `messageIdentity` (mesma estratégia clientMessageId > id > dbId já usada
// no merge) -- nunca reimplementa uma segunda noção de identidade.
//
// Critérios:
// - mantém a POSIÇÃO da primeira ocorrência (preserva ordem cronológica --
//   nunca reordena, nunca usa índice de array como key);
// - entre duas entradas com a mesma identidade, prefere a versão mais
//   "completa" -- uma que já tem `dbId` (persistida/confirmada pelo banco)
//   vence uma que ainda não tem (otimista/local, pode estar desatualizada);
// - mensagens sem NENHUMA identidade resolvível (não deveria acontecer,
//   ver messageIdentity) nunca são colapsadas entre si -- são mantidas
//   todas, para nunca esconder mensagens legítimas diferentes por engano.
export function dedupeMessagesForRender(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages ?? [];
  const indexByIdentity = new Map();
  const result = [];
  for (const msg of messages) {
    const identity = messageIdentity(msg);
    if (!identity) {
      result.push(msg);
      continue;
    }
    const existingIndex = indexByIdentity.get(identity);
    if (existingIndex === undefined) {
      indexByIdentity.set(identity, result.length);
      result.push(msg);
      continue;
    }
    const existing = result[existingIndex];
    if (!existing?.dbId && msg?.dbId) {
      result[existingIndex] = msg;
    }
  }
  return result;
}

export function mergeRestoredMessages(prev, loadedMessages) {
  const prevList = Array.isArray(prev) ? prev : [];
  const loadedList = Array.isArray(loadedMessages) ? loadedMessages : [];
  if (loadedList.length === 0) return prevList;

  const prevIds = new Set(prevList.map(messageIdentity).filter(Boolean));
  const seenLoadedIds = new Set();
  const dbOnly = loadedList.filter((msg) => {
    const identity = messageIdentity(msg);
    if (!identity) return true;
    if (prevIds.has(identity) || seenLoadedIds.has(identity)) return false;
    seenLoadedIds.add(identity);
    return true;
  });
  if (dbOnly.length === 0) return prevList;
  if (prevList.length === 0) return dbOnly;
  return [...prevList, ...dbOnly];
}
