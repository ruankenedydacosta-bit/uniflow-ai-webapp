// Sprint 2 — Memória Conversacional de curto prazo.
//
// createConversationalMemory() guarda, por INSTÂNCIA de conversa (nunca
// persistido, nunca de longo prazo), o contexto mínimo necessário para
// resolver referências como "essa conta", "essa categoria", "isso", "ele",
// "ela" na próxima frase do usuário.
//
// resolveReferences(text) é pura: substitui a expressão referencial pelo
// valor literal já lembrado nesta conversa, OU devolve o texto INALTERADO
// quando nada foi lembrado para aquele slot -- nunca inventa conta,
// categoria, data ou valor. Os parsers determinísticos downstream
// (financialConversation.interpret, resolveFinancialQuery) recebem sempre
// texto puro, sem saber que existe substituição -- zero mudança na
// arquitetura deles.
const ACCOUNT_REFERENCE_PATTERN =
  /\b(?:nessa|nesta|dessa|desta|naquela)\s+conta\b|\bess[ae]\s+conta\b|\baquela\s+conta\b/gi;
const CATEGORY_REFERENCE_PATTERN =
  /\b(?:nessa|nesta|dessa|desta|naquela)\s+categoria\b|\bess[ae]\s+categoria\b|\baquela\s+categoria\b/gi;
const BARE_PRONOUN_PATTERN = /^(?:ele|ela|isso|aquilo)[.!?]*$/i;

export function createConversationalMemory() {
  let account = null;
  let category = null;
  let period = null;
  let lastSubject = null; // 'account' | 'category' -- o mais recentemente lembrado
  let lastQuery = null;

  function remember({
    account: nextAccount,
    category: nextCategory,
    period: nextPeriod,
    queryType,
    queryParams,
    response,
  } = {}) {
    if (nextAccount != null) {
      account = nextAccount;
      lastSubject = 'account';
    }
    if (nextCategory != null) {
      category = nextCategory;
      lastSubject = 'category';
    }
    if (nextPeriod != null) {
      period = nextPeriod;
    }
    if (queryType != null) {
      lastQuery = { queryType, queryParams: queryParams ?? null, response: response ?? null };
    }
  }

  function resolveReferences(text) {
    if (typeof text !== 'string' || !text.trim()) return text;

    let resolved = text;

    if (account) {
      resolved = resolved.replace(ACCOUNT_REFERENCE_PATTERN, `na conta ${account}`);
    }
    if (category) {
      resolved = resolved.replace(CATEGORY_REFERENCE_PATTERN, `com ${category}`);
    }

    // Pronome solto (mensagem inteira, ex.: "Ele." "Isso.") -- só resolvido
    // quando existe um único assunto lembrado por último; caso contrário o
    // texto sai inalterado e a pergunta de esclarecimento normal continua
    // acontecendo exatamente como hoje.
    if (BARE_PRONOUN_PATTERN.test(resolved.trim())) {
      if (lastSubject === 'account' && account) {
        resolved = `na conta ${account}`;
      } else if (lastSubject === 'category' && category) {
        resolved = `com ${category}`;
      }
    }

    return resolved;
  }

  function getLastQuery() {
    return lastQuery;
  }

  function getPeriod() {
    return period;
  }

  function reset() {
    account = null;
    category = null;
    period = null;
    lastSubject = null;
    lastQuery = null;
  }

  return { remember, resolveReferences, getLastQuery, getPeriod, reset };
}
