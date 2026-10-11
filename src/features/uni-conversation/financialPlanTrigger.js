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
const INSTALLMENT_RE = /\b\d+\s*x\b|em\s+\d+\s+vezes|parcelad[oa]/i;
const RECURRING_RE = /\btodo\s+m[eê]s\b|\brecorrente\b|\bmensalmente\b|\btodo\s+dia\b|\btoda\s+semana\b/i;
const TRANSFER_RE = /\btransfer[iêeê]|\btransferência\b/i;
// Conjunções que tipicamente encadeiam duas cláusulas financeiras distintas
// na mesma frase -- "e", "também", "depois", "além disso", "mas",
// "enquanto". Cada pedaço vira uma cláusula candidata; nunca decide sozinho
// (uma cláusula sem nenhum sinal financeiro não conta).
// BUG REAL EM PRODUÇÃO (card de confirmação sumia): "aí" chegou a fazer
// parte desta lista, mas em português coloquial "aí" é quase sempre uma
// muleta de discurso ("registra pra mim aí duzentos reais de gasolina"),
// nunca uma conjunção que encadeia duas operações -- ao contrário de "e"/
// "também"/"mas", nenhum "BUG REAL" documentado motivou sua inclusão
// original. Com "aí" no split, essa frase virava DUAS cláusulas
// ("registra pra mim" + "duzentos reais de gasolina"), cada uma com sinal
// financeiro próprio (verbo / valor) -- looksLikeComplexFinancialText
// classificava a frase como multioperação, o parser de uma única operação
// (que já reconhece "registra") nunca chegava a rodar, e a mensagem ia
// inteira para a camada neural (financial_plan), que só responde em texto
// -- nunca monta o card estruturado (ver comentário no topo do arquivo:
// a camada neural existe só para multioperação/ambiguidade real). Removida
// -- "aí" nunca decide sozinho um split real de qualquer forma.
const CLAUSE_SPLIT_RE = /\s+(?:e|tamb[eé]m|depois|al[eé]m disso|mas|enquanto)\s+/i;
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
  if (isAgendaExpression(text)) return false;
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
// sinal de lançamento.
const LAUNCH_NOUN_RE = /(?:^|[^\p{L}])(?:despesas?|gastos?|receitas?|entradas?|pagamentos?|compras?|sa[íi]das?|lan[çc]amentos?|movimenta[çc](?:[ãa]o|[õo]es)|transa[çc](?:[ãa]o|[õo]es))(?=$|[^\p{L}])/iu;
const LAUNCH_REQUEST_VERB_RE = /(?:^|[^\p{L}])(?:registrar|registre|lan[çc]ar|lan[çc]asse|adicionar|adiciona|adicione|incluir|inclua|anotar|anote|criar|cria|crie|inserir|insere|insira|cadastrar|cadastra|cadastre)(?=$|[^\p{L}])/iu;

export function looksLikeUnclassifiedFinancialStatement(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  if (isAgendaExpression(text)) return false;
  if (!hasAnyAmountMention(text)) return false;
  return FINANCIAL_VERB_RE.test(text) || LAUNCH_NOUN_RE.test(text) || LAUNCH_REQUEST_VERB_RE.test(text);
}
