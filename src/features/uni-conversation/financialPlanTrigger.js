import { extractAmount } from '../uni-intents/index.js';
import { classifyIntent, AGENDA_INTENT_SET } from '../uni-intents/intentClassifier.js';

// CAMADA 0: frases de agenda/lembrete ("tenho uma reunião daqui 10 dias",
// "me lembra amanhã") NUNCA são candidatas a plano financeiro -- números de
// tempo não são dinheiro. Único sinal determinístico aceito depois da
// CAMADA 0 do classifier: se o intent é de AGENDA_INTENTS, todas as demais
// funções deste módulo respondem false sem olhar o resto.
export function isAgendaExpression(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  return AGENDA_INTENT_SET.has(classifyIntent(text).intent);
}

// Heurísticas determinísticas (nunca IA) do caminho por regras. Com o
// uni-interpret disponível, quem decide a intenção é ele (#80); estas
// funções só valem para pendências e para a reserva sem IA.
// BUG REAL EM PRODUCAO: "Coloquei duzentos reais de gasolina." nao batia em
// nenhum verbo aqui -- a frase acabava caindo no chat geral (ver
// looksLikeUnclassifiedFinancialStatement abaixo, a barreira determinística
// que usa esta mesma lista como um dos dois sinais aceitos).
// BUG REAL (BUG 2): "entrou/caiu/entraram/cairam" faltavam -- uma frase
// como "Entrou mil reais." não era um fresh statement (ver
// looksLikeFreshFinancialStatement), então com uma pendência ativa ela
// virava resposta de campo e era proposta como NOME DE CONTA.
// BUG REAL EM PRODUCAO: "Coloca pra mim aí setenta e cinco reais no
// mercado." (imperativo) nao batia aqui nem em classifyIntent -- so o
// passado "coloquei" estava coberto, entao a barreira determinística nunca
// disparava e a frase caia inteira no chat geral (resposta so em texto,
// sem card, "confirmar" depois virava consulta). "coloca/bota/poe" sao a
// mesma familia de verbo coloquial de lancamento, so no imperativo.
const FINANCIAL_VERB_RE = /\b(gastei|gasto|paguei|pago|recebi|recebo|comprei|compro|transferi|transfiro|ganhei|ganho|investi|invisto|abasteci|coloquei|botei|coloca|bota|poe|entrou|caiu|entraram|cairam|lancei|lance|lan[çc]a|registrei|registra|registro|anotei|anota)\b/i;
const MONEY_MENTION_RE = /r\$\s*\d+(?:[.,]\d+)?|\b\d+(?:[.,]\d+)?\s*reais\b/gi;
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
 * Casos em que o parser determinístico JÁ rodou e devolveu um intent que o
 * chat só registra pelo uni-interpret (ex.: transferência) -- sem ele, a
 * Uni avisa que ainda não registra.
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
  if (isAgendaExpression(text)) return false;
  return FINANCIAL_VERB_RE.test(text) && hasAnyAmountMention(text);
}

/**
 * Variante para DECLARAÇÕES DE SALDO -- um enunciado novo e autossuficiente
 * sobre o saldo de uma conta ("Meu saldo no Nubank é R$ 1.000") ou uma
 * declaração genérica com valor ("Tenho R$ 1.000") também nunca pode ser
 * engolido por uma pendência antiga: essas frases começam uma nova intenção
 * (ajuste de saldo / pergunta de decisão), não respondem a uma pergunta
 * anterior.
 */
export function looksLikeFreshBalanceStatement(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  if (isAgendaExpression(text)) return false;
  if (!hasAnyAmountMention(text)) return false;
  const normalized = text.trim().toLowerCase();
  return /(^|[\s,:])(?:meu|o|nosso)\s+saldo/.test(normalized)
    || /(?:coloca|define|ajusta|ajuste|corrige|corrija)\b[^.!?]*\bsaldo/.test(normalized)
    || /^(?:eu\s+)?(?:tenho|estou\s+com|to\s+com)/.test(normalized);
}

// BUG REAL EM PRODUCAO: "Coloquei duzentos reais de gasolina." nao batia em
// nenhum intent do parser determinístico de uma única operação (classifyIntent
// em intentClassifier.js) -- o parser devolvia handled:false, e como o intent
// resultante ('question') não era elegível para o plano (só
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
// verbo futuro e ainda não catalogado apareça. Nesse caso o chamador pede
// para a pessoa reformular -- nunca vai direto para handleUnresolvedMessage.
//
// BUG REAL EM PRODUCAO (voz): "Adicione 250 de despesas com gasolina" não
// passava por aqui -- o plural "despesas", "saída" e os verbos de pedido
// ("adicione", "lançar", "incluir") ficavam de fora, e a frase ia para o chat
// geral, que respondia "não consigo criar a movimentação por aqui". As
// fronteiras são por letra Unicode porque \b não enxerga "í" de "saída".
//
// BUG REAL EM PRODUCAO (voz, 10/10/2026): "Fazer um lançamento de teste:
// descrição "teste", categoria "educação", valor 350 reais" ia para o chat
// geral, que respondeu "não consigo registrar nem alterar lançamentos". A
// palavra do próprio produto ("lançamento", "movimentação") não contava como
// sinal de lançamento. Ela só conta fora de pergunta: "quais lançamentos
// acima de 200 reais?" é consulta.
const LAUNCH_NOUN_RE = /(?:^|[^\p{L}])(?:despesas?|gastos?|receitas?|entradas?|pagamentos?|compras?|sa[íi]das?)(?=$|[^\p{L}])/iu;
const ENTRY_NOUN_RE = /(?:^|[^\p{L}])(?:lan[çc]amentos?|movimenta[çc](?:[ãa]o|[õo]es)|transa[çc](?:[ãa]o|[õo]es))(?=$|[^\p{L}])/iu;
const QUESTION_RE = /\?\s*$|^\s*(?:quais|qual|quanto|quantos|quantas|quando|onde|como|me\s+mostra|mostra|mostre|lista|liste|listar|ver|veja)(?=$|[^\p{L}])/iu;
const LAUNCH_REQUEST_VERB_RE = /(?:^|[^\p{L}])(?:registrar|registre|lan[çc]ar|lan[çc]asse|adicionar|adiciona|adicione|incluir|inclua|anotar|anote|inserir|insere|insira)(?=$|[^\p{L}])/iu;

export function looksLikeUnclassifiedFinancialStatement(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  if (isAgendaExpression(text)) return false;
  if (!hasAnyAmountMention(text)) return false;
  return FINANCIAL_VERB_RE.test(text)
    || LAUNCH_NOUN_RE.test(text)
    || LAUNCH_REQUEST_VERB_RE.test(text)
    || (ENTRY_NOUN_RE.test(text) && !QUESTION_RE.test(text));
}

// Sem o uni-interpret (#80), o parser de uma operação não separa várias
// operações nem entende parcela. Devolve o motivo para a Uni
// pedir de outro jeito em vez de abrir um card errado; null quando a frase
// cabe numa operação só.
const PARCELAMENTO_RE = /\b\d+\s*x\b|em\s+\d+\s+vezes|parcelad[oa]|\b\d+\s+parcelas\b/i;

export function motivoParaNaoLerSemModelo(text) {
  if (typeof text !== 'string' || !text.trim() || isAgendaExpression(text)) return null;
  // Sem valor, é pergunta ("quanto parcelei?"): segue para as regras.
  if (!hasAnyAmountMention(text)) return null;
  if (PARCELAMENTO_RE.test(text)) return 'parcela';
  if (countMoneyMentions(text) >= 2) return 'varias';
  return null;
}
