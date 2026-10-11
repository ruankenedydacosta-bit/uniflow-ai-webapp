// Rota de uma frase nova a partir da interpretação do uni-interpret (#80).
//
// O modelo decide o que a pessoa quer; as regras fixas só rodam quando não
// há interpretação (IA desligada, teto atingido, erro, tempo esgotado).
// Antes, a regex decidia a intenção e o modelo só corrigia os campos: frase
// com verbo fora da lista ("fazer um lançamento de 350") caía no chat geral,
// que respondia "não consigo registrar".

import { normalizeFinancialText } from '../uni-intents/index.js';
import { formatCurrency } from '../../utils/formatters.js';

export const ROTAS_INTERPRETACAO = Object.freeze({
  LANCAMENTO: 'lancamento',
  PLANO: 'plano',
  SALDO: 'saldo',
  META: 'meta',
  CONSULTA: 'consulta',
  AGENDA: 'agenda',
  CONVERSA: 'conversa',
  NAO_ENTENDI: 'nao_entendi',
});

const INTENT_POR_TIPO = Object.freeze({ saida: 'register_expense', entrada: 'register_income' });

// Recorrência numa operação só vira o card deste lançamento: quem diz "pago
// 120 de academia todo mês" quase sempre quer lançar o mês, e um falso
// positivo do modelo ("mensalidade do sistema") não pode bloquear o
// registro. Parcela não: gravar o total como compra avulsa seria errado.
function ehLancamentoSimples(operacao) {
  return Object.hasOwn(INTENT_POR_TIPO, operacao?.tipo) && !operacao.parcelas;
}

// null quando não há interpretação utilizável: o chamador segue com as
// regras fixas.
export function escolherRotaDaInterpretacao(interpretacao) {
  if (!interpretacao || typeof interpretacao.intent !== 'string') return null;
  const operacoes = Array.isArray(interpretacao.operacoes) ? interpretacao.operacoes : [];

  switch (interpretacao.intent) {
    case 'lancamento':
    case 'correcao':
      // Sem rascunho na tela, "correcao" é um lançamento novo. Mais de uma
      // operação, transferência ou parcela vão para o plano, que sabe
      // revisar várias de uma vez.
      if (operacoes.length === 1 && ehLancamentoSimples(operacoes[0])) {
        return ROTAS_INTERPRETACAO.LANCAMENTO;
      }
      return operacoes.length > 0 ? ROTAS_INTERPRETACAO.PLANO : ROTAS_INTERPRETACAO.NAO_ENTENDI;
    case 'saldo':
      return ROTAS_INTERPRETACAO.SALDO;
    case 'meta':
      return ROTAS_INTERPRETACAO.META;
    case 'consulta':
      return ROTAS_INTERPRETACAO.CONSULTA;
    case 'agenda':
      return ROTAS_INTERPRETACAO.AGENDA;
    case 'conversa':
      return ROTAS_INTERPRETACAO.CONVERSA;
    case 'nao_entendi':
      return ROTAS_INTERPRETACAO.NAO_ENTENDI;
    default:
      return null;
  }
}

// Operação única de saída ou entrada → o par (parsed, overrides) que o fluxo
// de lançamento usa para montar o card. Os ids de categoria e conta vêm do
// catálogo do próprio usuário, já validados pela função. null quando a
// interpretação não é um lançamento simples.
export function interpretacaoParaRascunho(interpretacao, texto) {
  if (escolherRotaDaInterpretacao(interpretacao) !== ROTAS_INTERPRETACAO.LANCAMENTO) return null;
  const [operacao] = interpretacao.operacoes;
  const valor = Number(operacao.valor);
  const descricao = typeof operacao.descricao === 'string' && operacao.descricao.trim()
    ? operacao.descricao.trim()
    : null;
  const novaCategoria = !operacao.categoria?.id && typeof operacao.novaCategoria === 'string' && operacao.novaCategoria.trim()
    ? operacao.novaCategoria.trim()
    : null;

  const parsed = {
    intent: INTENT_POR_TIPO[operacao.tipo],
    input: texto,
    normalizedInput: normalizeFinancialText(texto),
    entities: {
      amount: Number.isFinite(valor) && valor > 0 ? valor : null,
      date: typeof operacao.data === 'string' && operacao.data ? operacao.data : null,
      description: descricao,
      category: null,
      account: null,
      destinationAccount: null,
    },
  };

  const overrides = {};
  if (operacao.categoria?.id) overrides.categoryId = operacao.categoria.id;
  // Categoria pedida pelo nome e ausente do catálogo: o card propõe criá-la
  // com esse nome. Sem a decisão explícita, os apelidos fixos trocariam
  // "Viagem de férias" por "Lazer".
  if (novaCategoria) {
    overrides.categoryName = novaCategoria;
    overrides.categoryDecision = 'create_new';
  }
  if (operacao.conta?.id) overrides.accountId = operacao.conta.id;
  return { parsed, overrides };
}

function tipoDaOperacaoDoPlano(operacao) {
  if (operacao.tipo === 'transferencia') return 'transfer';
  if (operacao.tipo === 'saida') {
    if (operacao.parcelas) return 'installment_purchase';
    return operacao.recorrente === true ? 'recurring_expense' : 'expense';
  }
  return operacao.recorrente === true ? 'recurring_income' : 'income';
}

// Operações da interpretação → plano que createPendingFinancialPlan recebe.
// Conta e categoria vão pelo id escolhido no catálogo; o nome só aparece no
// resumo. null quando a interpretação não é um plano.
export function interpretacaoParaPlano(interpretacao) {
  if (escolherRotaDaInterpretacao(interpretacao) !== ROTAS_INTERPRETACAO.PLANO) return null;
  const operations = interpretacao.operacoes.map((operacao, indice) => {
    const operationType = tipoDaOperacaoDoPlano(operacao);
    const valor = Number(operacao.valor);
    return {
      temporaryId: `op${indice + 1}`,
      operationType,
      amount: Number.isFinite(valor) && valor > 0 ? valor : null,
      description: typeof operacao.descricao === 'string' && operacao.descricao.trim() ? operacao.descricao.trim() : null,
      date: typeof operacao.data === 'string' && operacao.data ? operacao.data : null,
      sourceAccountReference: operacao.conta?.name ?? null,
      destinationAccountReference: operacao.contaDestino?.name ?? null,
      categoryReference: operationType === 'transfer'
        ? null
        : operacao.categoria?.name ?? operacao.novaCategoria ?? null,
      accountId: operacao.conta?.id ?? null,
      destinationAccountId: operacao.contaDestino?.id ?? null,
      categoryId: operationType === 'transfer' ? null : operacao.categoria?.id ?? null,
    };
  });
  return { operations, clarificationQuestion: null };
}

// Compromisso → campos que o fluxo da agenda usa no lugar da regex (#142).
// O valor citado entra no título, que é o que aparece no Google Agenda e no
// lembrete, a não ser que o título já traga um número. null quando o modelo não deu título: a regex tenta ou a Uni
// pergunta.
export function interpretacaoParaAgenda(interpretacao) {
  if (escolherRotaDaInterpretacao(interpretacao) !== ROTAS_INTERPRETACAO.AGENDA) return null;
  const titulo = typeof interpretacao.agenda?.titulo === 'string' ? interpretacao.agenda.titulo.trim() : '';
  if (!titulo) return null;
  const valor = Number(interpretacao.agenda.valor);
  if (Number.isFinite(valor) && valor > 0 && !/\d/.test(titulo)) {
    return { titulo: `${titulo} no valor de ${formatCurrency(valor)}` };
  }
  return { titulo };
}
