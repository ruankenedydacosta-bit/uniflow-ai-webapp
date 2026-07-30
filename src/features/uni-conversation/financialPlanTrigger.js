import { extractAmount } from '../uni-intents/index.js';

// BLOCO E: heurística determinística (nunca IA) que decide QUANDO vale a
// pena chamar a camada neural (financial_plan) em vez do parser de uma
// única operação já existente -- section 2/6 da tarefa: "parser
// determinístico tenta primeiro; se ... for multi-operação/ambíguo, chama
// a camada neural". Falsos negativos aqui apenas mantêm o comportamento
// ATUAL (parser de uma operação, ou a mensagem de "não suportado" já
// existente) -- nunca quebram nada; falsos positivos apenas fazem uma
// chamada extra à IA que, se não trouxer um plano válido, também cai de
// volta no comportamento atual (ver financialPlanService.interpret).
// BUG REAL EM PRODUCAO: "Coloquei duzentos reais de gasolina." nao batia em
// nenhum verbo aqui -- a frase acabava caindo no chat geral (ver
// looksLikeUnclassifiedFinancialStatement abaixo, a barreira determinística
// que usa esta mesma lista como um dos dois sinais aceitos).
const FINANCIAL_VERB_RE = /\b(gastei|gasto|paguei|pago|recebi|recebo|comprei|compro|transferi|transfiro|ganhei|ganho|investi|invisto|abasteci|coloquei|botei|lancei|lance|lan[çc]a|registrei|registra|registro|anotei|anota)\b/i;
const MONEY_MENTION_RE = /r\$\s*\d+(?:[.,]\d+)?|\b\d+(?:[.,]\d+)?\s*reais\b/gi;
const INSTALLMENT_RE = /\b\d+\s*x\b|em\s+\d+\s+vezes|parcelad[oa]/i;
const RECURRING_RE = /\btodo\s+m[eê]s\b|\brecorrente\b|\bmensalmente\b|\btodo\s+dia\b|\btoda\s+semana\b/i;
const TRANSFER_RE = /\btransfer[iêeê]|\btransferência\b/i;
// Conjunções que tipicamente encadeiam duas cláusulas financeiras distintas
// na mesma frase -- "e", "também", "depois", "aí", "além disso", "mas",
// "enquanto". Cada pedaço vira uma cláusula candidata; nunca decide sozinho
// (uma cláusula sem nenhum sinal financeiro não conta).
const CLAUSE_SPLIT_RE = /\s+(?:e|tamb[eé]m|depois|a[íi]|al[eé]m disso|mas|enquanto)\s+/i;
// Sinal de que uma conta/instituição foi mencionada na cláusula, mesmo sem
// verbo financeiro próprio (ex.: "e a gasolina eu paguei pelo Banco do
// Brasil" -- "pelo" já é sinal suficiente de conta associada a essa cláusula).
const ACCOUNT_CUE_RE = /\b(pelo|pela|no banco|na conta|do banco|da conta|cart[aã]o)\b/i;

export function countMoneyMentions(text) {
  if (typeof text !== 'string') return 0;
  const matches = text.match(MONEY_MENTION_RE);
  return matches ? matches.length : 0;
}

// BUG REAL: MONEY_MENTION_RE só reconhece valores em algarismo ("50",
// "R$ 50") -- uma frase com número por extenso ("cinquenta reais") não
// batia aqui, mesmo tendo um valor real. Reaproveita extractAmount
// (uni-intents/entityExtractor.js), que já entende número por extenso em
// pt-BR (com as mesmas guardas de ambiguidade), em vez de duplicar essa
// tabela de palavras aqui.
export function hasAnyAmountMention(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  return countMoneyMentions(text) >= 1 || extractAmount(text) !== null;
}

/**
 * Divide o texto em cláusulas candidatas por conjunção. Cada cláusula é
 * considerada "com sinal financeiro" se tiver verbo financeiro, menção a
 * valor ou uma referência de conta/instituição -- usado só para decidir se
 * a frase tem MAIS DE UMA operação (roteamento), nunca para extrair os
 * campos finais (isso continua sendo responsabilidade da camada neural/
 * pendingFinancialPlan, nunca duplicado aqui).
 */
export function splitFinancialClauses(text) {
  if (typeof text !== 'string') return [];
  return text
    .split(CLAUSE_SPLIT_RE)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function clauseHasFinancialSignal(clause) {
  return FINANCIAL_VERB_RE.test(clause)
    || TRANSFER_RE.test(clause)
    || hasAnyAmountMention(clause)
    || ACCOUNT_CUE_RE.test(clause);
}

/**
 * Retorna true quando o texto sugere uma frase financeira COMPLEXA --
 * multioperação, parcelamento, recorrência, transferência, ou duas
 * cláusulas encadeadas por conjunção com sinal financeiro próprio (mesmo
 * quando só uma delas tem valor explícito, ex.: "Gastei R$ 50 no mercado e
 * a gasolina eu paguei pelo Banco do Brasil") -- que o parser de uma única
 * transação não modela. Sempre exige um verbo financeiro (ou transferência)
 * em algum lugar da frase para evitar falsos positivos em perguntas
 * genéricas.
 */
export function looksLikeComplexFinancialText(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  if (!FINANCIAL_VERB_RE.test(text) && !TRANSFER_RE.test(text)) return false;
  // Transferência nunca é modelada pelo parser de uma única operação (que
  // só entende income/expense) -- qualquer menção a transferência já basta
  // para tentar a camada neural, mesmo com um único valor mencionado.
  if (TRANSFER_RE.test(text)) return true;
  if (countMoneyMentions(text) >= 2) return true;
  if (INSTALLMENT_RE.test(text)) return true;
  if (RECURRING_RE.test(text)) return true;

  const clauses = splitFinancialClauses(text);
  if (clauses.length >= 2) {
    const clausesWithSignal = clauses.filter(clauseHasFinancialSignal);
    if (clausesWithSignal.length >= 2) return true;
  }

  return false;
}

/**
 * Casos em que o parser determinístico JÁ rodou e devolveu um intent que o
 * chat não suporta hoje (ex.: transferência) -- em vez do aviso estático
 * "ainda não posso fazer isso", tentamos a camada neural primeiro.
 */
export function isUnsupportedIntentEligibleForPlan(intent) {
  return intent === 'register_transfer';
}

/**
 * Detecta um enunciado financeiro NOVO e AUTOSSUFICIENTE (tem verbo
 * financeiro próprio E valor próprio) -- usado para nunca deixar uma
 * pendência antiga (Pending Action ou financial_plan não encerrado)
 * "engolir" uma frase completamente independente como se fosse uma
 * resposta/correção a uma pergunta anterior. Uma correção real ("foi
 * ontem", "200 reais", "Nubank") nunca tem os dois ao mesmo tempo, então
 * nunca dispara isso -- só uma frase que já se descreve por completo.
 */
export function looksLikeFreshFinancialStatement(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  return FINANCIAL_VERB_RE.test(text) && hasAnyAmountMention(text);
}

// BUG REAL EM PRODUCAO: "Coloquei duzentos reais de gasolina." nao batia em
// nenhum intent do parser determinístico de uma única operação (classifyIntent
// em intentClassifier.js) -- o parser devolvia handled:false, e como o intent
// resultante ('question') não era elegível para financial_plan (só
// register_transfer era, via isUnsupportedIntentEligibleForPlan) nem
// create_goal nem uma pergunta sobre o futuro, a frase caía direto em
// handleUnresolvedMessage (chat geral / modo SUPPORT), cujo prompt
// corretamente diz "voce so pode orientar, nunca dizer que fez" -- daí a
// resposta "nao consigo registrar daqui". O verbo "coloquei" já foi
// adicionado a classifyIntent/FINANCIAL_VERB_RE nesta correção, então esse
// caso específico agora é resolvido antes de chegar aqui -- mas esta função é
// a BARREIRA DETERMINÍSTICA de última instância: qualquer frase com um valor
// monetário real (R$/reais, inclusive por extenso) E algum sinal mínimo de
// lançamento (verbo financeiro OU substantivo "despesa/gasto/receita/
// entrada/pagamento") NUNCA deve ser tratada como chat geral, mesmo que um
// verbo futuro e ainda não catalogado apareça. Nesse caso o chamador deve
// tentar financial_plan (camada neural) antes de qualquer resposta
// consultiva -- nunca ir direto para handleUnresolvedMessage.
const LAUNCH_NOUN_RE = /\b(despesa|gasto|receita|entrada|pagamento)\b/i;

export function looksLikeUnclassifiedFinancialStatement(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  if (!hasAnyAmountMention(text)) return false;
  return FINANCIAL_VERB_RE.test(text) || LAUNCH_NOUN_RE.test(text);
}
