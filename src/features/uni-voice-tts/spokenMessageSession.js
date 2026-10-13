// Registro em nível de módulo dos IDs de mensagens da Uni já narradas pelo
// autoplay durante a sessão atual do navegador, separado por usuário (Set
// de módulo).
//
// Por que existe: o guard anterior (autoSpokenMessageIdRef, um useRef local
// de UniChatPage) era perdido no unmount ao trocar de rota -- ao voltar para
// /app/home, o histórico era restaurado e a última mensagem antiga da Uni era
// narrada de novo como se fosse nova, sem existir mensagem nova.
//
// Regras:
// - Sobrevive a unmount/remount e troca de rota (estado de módulo, nunca de
//   componente);
// - Nunca usa localStorage: nada persiste entre reloads, abas ou usuários;
// - Chaveado por user.id (fallback anônimo estável para o modo demo/sem
//   sessão) -- o usuário A nunca vê o registro do usuário B;
// - resetAutoSpokenMessages() é chamado no logout (SessionContext), então o
//   registro nunca vaza entre sessões;
// - Só marca IDs depois que a tentativa válida de autoplay decidiu narrar
//   (nunca antes da guarda passar);
// - O botão manual "Ouvir" (handleSpeakMessage) não consulta este registro --
//   continua funcionando mesmo depois do autoplay já ter narrado a mensagem.
const spokenByUser = new Map();

const ANONYMOUS_USER_KEY = '__anonymous__';

function resolveUserKey(userId) {
  return typeof userId === 'string' && userId ? userId : ANONYMOUS_USER_KEY;
}

export function hasAutoSpokenMessage(userId, messageId) {
  if (messageId == null) return false;
  const ids = spokenByUser.get(resolveUserKey(userId));
  return Boolean(ids && ids.has(messageId));
}

export function markAutoSpokenMessage(userId, messageId) {
  if (messageId == null) return;
  const key = resolveUserKey(userId);
  let ids = spokenByUser.get(key);
  if (!ids) {
    ids = new Set();
    spokenByUser.set(key, ids);
  }
  ids.add(messageId);
}

// Hidratação de reload/login: marca em lote mensagens RESTAURADAS do
// histórico (localStorage/Supabase) como já narradas, ANTES de o autoplay
// ser armado -- mensagens restauradas são conteúdo antigo, nunca eventos
// novos, e não podem disparar narração. Aceita a lista completa de
// mensagens (a função filtra `from === 'uni'` e IDs nulos). Idempotente --
// chamada no snapshot do armamento E nos pontos de restauração
// (loadMessages/switchConversation) sem efeito colateral.
export function markRestoredMessagesAsSpoken(userId, messages) {
  if (!Array.isArray(messages) || messages.length === 0) return;
  const key = resolveUserKey(userId);
  let ids = spokenByUser.get(key);
  for (const message of messages) {
    if (message?.from === 'uni' && message?.id != null) {
      if (!ids) {
        ids = new Set();
        spokenByUser.set(key, ids);
      }
      ids.add(message.id);
    }
  }
}

export function resetAutoSpokenMessages() {
  spokenByUser.clear();
}
