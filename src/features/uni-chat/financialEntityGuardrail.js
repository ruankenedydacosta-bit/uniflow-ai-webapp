// Sprint 4 Ciclo 4 (Bloco 4.8) — guardrail determinístico de ENTIDADES
// textuais (contas/bancos/cartões/carteiras/categorias/metas/
// investimentos/ativos) citadas pela composição via LLM.
//
// Mesma filosofia já usada para números (composeNaturalFinancialResponse.js
// -- validateComposedResponse): a LLM nunca é confiada por padrão. Toda
// entidade nomeada que aparece no texto final só pode ser publicada se
// vier comprovadamente dos FATOS ESTRUTURADOS reais (nunca "quase igual",
// nunca "parece existir").
//
// Duas checagens complementares, nenhuma delas depende de a LLM declarar
// corretamente o que está citando:
//
// 1) ENTIDADE REAL FORA DE ESCOPO -- o texto menciona um nome que É uma
//    conta/categoria real do workspace (`universeEntityNames`, mesma
//    lista de nomes já enviada à interpretação semântica -- nunca saldo/
//    id/dado sensível, só nomes), mas que não está entre os nomes que os
//    FATOS DESTA RESPOSTA especificamente autorizam (`allowedEntityNames`,
//    calculado pelo orquestrador a partir do texto determinístico
//    confiável). Isso pega o caso "a LLM trocou Nubank por Itaú" -- ambos
//    reais, resposta errada mesmo assim.
// 2) ENTIDADE INVENTADA -- um nome que aparece logo depois de uma palavra-
//    gatilho financeira ("conta", "banco", "cartão", "carteira",
//    "categoria", "meta", "investimento", "ativo") e que não bate com
//    NENHUM nome real do universo. Isso pega o caso "Bradesco" quando o
//    usuário nunca teve uma conta com esse nome.
//
// Qualquer entidade reprovada bloqueia a publicação do texto da LLM --
// nunca edita/lima o texto, só reprova o texto inteiro (o chamador cai no
// fallback determinístico, mesmo caminho já usado para números inválidos).
import { normalizeFinancialText } from './financialSnapshot.js';

const ENTITY_TRIGGER_WORDS = [
  'conta', 'contas', 'banco', 'bancos', 'cartao', 'cartoes', 'carteira',
  'carteiras', 'categoria', 'categorias', 'meta', 'metas', 'investimento',
  'investimentos', 'ativo', 'ativos',
];

// Palavra-gatilho seguida de uma sequência de 1 a 3 palavras capitalizadas
// (nome próprio) -- "na conta Nubank", "no banco Itaú Personnalité", "na
// categoria Alimentação Fora". Não depende de acento/caixa da palavra-
// gatilho (o texto pode vir com "Conta"/"CONTA"), mas exige que o NOME
// comece maiúsculo (convenção de nome próprio em pt-BR).
// Sem a flag 'i': a caixa alta em [A-ZÀ-Ú] precisa ser exigida de
// verdade -- com 'i' ligado, "categoria dele" também capturaria "dele"
// como se fosse um nome próprio (bug encontrado nos testes desta etapa).
// A palavra-gatilho em si (fora do grupo capturado) já é normalizada
// antes de chegar aqui só quando necessário; aqui ela é buscada como
// aparece no texto original, então aceitamos as duas caixas manualmente
// via classe de caracteres em vez da flag 'i' global.
const TRIGGER_WORD_PATTERN = ENTITY_TRIGGER_WORDS
  .map((word) => word.split('').map((ch) => `[${ch}${ch.toUpperCase()}]`).join(''))
  .join('|');
const TRIGGER_PATTERN = new RegExp(
  `\\b(?:${TRIGGER_WORD_PATTERN})\\s+([A-ZÀ-Ú][\\wÀ-ÿ]*(?:\\s+[A-ZÀ-Ú][\\wÀ-ÿ]*){0,2})`,
  'gu',
);

function normalize(value) {
  return normalizeFinancialText(value);
}

// Devolve os nomes de `knownNames` que aparecem literalmente (por
// palavra/fronteira, sem acento, sem caixa) dentro de `text`. Usado tanto
// para calcular o conjunto PERMITIDO (a partir do texto determinístico
// confiável) quanto para detectar menções reais fora de escopo (a partir
// do texto da LLM).
export function extractMentionedEntityNames(text, knownNames) {
  if (typeof text !== 'string' || !text.trim() || !Array.isArray(knownNames)) return [];
  const normalizedText = normalize(text);
  if (!normalizedText) return [];
  const found = new Set();
  for (const name of knownNames) {
    const normalizedName = normalize(name);
    if (!normalizedName) continue;
    const pattern = new RegExp(`\\b${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (pattern.test(normalizedText)) found.add(name);
  }
  return [...found];
}

// Devolve as frases capturadas logo após uma palavra-gatilho financeira
// ("conta X", "banco Y") -- candidatas a nome de entidade citado pela LLM,
// independente de existirem ou não.
export function extractTriggeredEntityMentions(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  const matches = [];
  for (const match of text.matchAll(TRIGGER_PATTERN)) {
    if (match[1]) matches.push(match[1].trim());
  }
  return matches;
}

// Guardrail principal. `allowedEntityNames` = nomes reais que os FATOS
// desta resposta especificamente autorizam (o orquestrador já calcula
// isso a partir do texto determinístico -- ver financialSemanticOrchestrator.js).
// `universeEntityNames` = todos os nomes reais de conta/categoria do
// workspace (mesma lista, sem saldo/id, já enviada à interpretação
// semântica -- Sprint 3), usada só para diferenciar "real mas fora de
// escopo" de "inventado". Nunca lança; retorno determinístico.
export function validateComposedEntities(text, {
  allowedEntityNames = [],
  universeEntityNames = [],
} = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    return { valid: true, invalidEntities: [], reason: null };
  }
  const allowedSet = new Set((Array.isArray(allowedEntityNames) ? allowedEntityNames : []).map(normalize).filter(Boolean));
  const universe = Array.isArray(universeEntityNames) ? universeEntityNames : [];

  // 1) Entidade real, mas fora do escopo autorizado por esta resposta.
  const mentionedRealNames = extractMentionedEntityNames(text, universe);
  const outOfScope = mentionedRealNames.filter((name) => !allowedSet.has(normalize(name)));
  if (outOfScope.length > 0) {
    return { valid: false, invalidEntities: outOfScope, reason: 'entity_out_of_scope' };
  }

  // 2) Entidade citada após palavra-gatilho que não bate com NENHUM nome
  // real do universo -- candidata a invenção.
  const universeNormalized = new Set(universe.map(normalize).filter(Boolean));
  const triggered = extractTriggeredEntityMentions(text);
  const invented = triggered.filter((mention) => {
    const normalizedMention = normalize(mention);
    if (!normalizedMention) return false;
    if (universeNormalized.has(normalizedMention)) return false;
    // Também aceita quando a menção é uma SUBSTRING de um nome real (ex.:
    // "conta Nubank Empresarial" citando só "Nubank" de um nome maior) ou
    // vice-versa -- nunca bloqueia por causa de pontuação/capitalização
    // parcial, só bloqueia quando não há nenhuma relação textual com um
    // nome real.
    return ![...universeNormalized].some((real) => real.includes(normalizedMention) || normalizedMention.includes(real));
  });
  if (invented.length > 0) {
    return { valid: false, invalidEntities: invented, reason: 'entity_invented' };
  }

  return { valid: true, invalidEntities: [], reason: null };
}
