// Registro em nível de módulo dos TEXTOS de mensagens da Uni já narrados
// por voz durante a sessão atual do navegador, separado por usuário -- o
// mesmo padrão de spokenMessageSession.js (Map de módulo chaveado por
// sessão), mas chaveado por CONTEÚDO em vez de ID de mensagem.
//
// Por que existe (BUG REAL validado em produção): o dedup por message id
// (spokenMessageSession) garante que a MESMA mensagem nunca narre duas
// vezes -- mas duas mensagens DIFERENTES com o MESMO texto (ex.: um
// double-fire do transcript de voz entregando "Caixa" duas vezes, gerando
// duas respostas idênticas) narravam as duas, porque cada id era inédito.
// A regra deste registro é: dois creates com o mesmo conteúdo → somente o
// primeiro narra.
//
// Regras:
// - Sobrevive a unmount/remount e troca de rota (estado de módulo, nunca de
//   componente);
// - Nunca usa localStorage: nada persiste entre reloads, abas ou usuários;
// - Chaveado por user.id (fallback anônimo estável para o modo demo/sem
//   sessão) -- o usuário A nunca silencia a narração do usuário B;
// - resetNarratedTexts() é chamado no logout (SessionContext, junto de
//   resetAutoSpokenMessages), então o registro nunca vaza entre sessões;
// - A marca acontece APENAS no momento em que o pipeline decide narrar
//   (markNarratedText antes de speakMessage), e mensagens que repetem um
//   texto já narrado continuam sendo renderizadas -- só a NARRAÇÃO é
//   silenciada, e elas ainda são marcadas como faladas por id para o efeito
//   de autoplay nunca tentar narrá-las depois;
// - O botão manual "Ouvir" (handleSpeakMessage) não consulta este
//   registro -- repetir manualmente uma mensagem continua funcionando.
const narratedTextsByUser = new Map();

const ANONYMOUS_USER_KEY = '__anonymous__';

function resolveUserKey(userId) {
  return typeof userId === 'string' && userId ? userId : ANONYMOUS_USER_KEY;
}

export function hasNarratedText(userId, text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  const texts = narratedTextsByUser.get(resolveUserKey(userId));
  return Boolean(texts && texts.has(text));
}

export function markNarratedText(userId, text) {
  if (typeof text !== 'string' || !text.trim()) return;
  const key = resolveUserKey(userId);
  let texts = narratedTextsByUser.get(key);
  if (!texts) {
    texts = new Set();
    narratedTextsByUser.set(key, texts);
  }
  texts.add(text);
}

export function resetNarratedTexts() {
  narratedTextsByUser.clear();
}
