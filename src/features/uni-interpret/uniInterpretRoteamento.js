// Rota de uma frase nova a partir da interpretação do uni-interpret (#80).
//
// O modelo decide o que a pessoa quer; as regras fixas só rodam quando não
// há interpretação (IA desligada, teto atingido, erro, tempo esgotado).
// Antes, a regex decidia a intenção e o modelo só corrigia os campos: frase
// com verbo fora da lista ("fazer um lançamento de 350") caía no chat geral,
// que respondia "não consigo registrar".

import { normalizeFinancialText } from '../uni-intents/index.js';
import { formatCurrency } from '../../utils/formatters.js';
import { MAX_RECURRENCE_INTERVAL } from '../uni-conversation/pendingFinancialPlan.js';

export const ROTAS_INTERPRETACAO = Object.freeze({
  LANCAMENTO: 'lancamento',
  PLANO: 'plano',
  SALDO: 'saldo',
  META: 'meta',
  CONSULTA: 'consulta',
  AGENDA: 'agenda',
  CATEGORIA: 'categoria',
  EXCLUSAO: 'exclusao',
  EDICAO: 'edicao',
  RECORRENCIA: 'recorrencia',
  CONVERSA: 'conversa',
  NAO_ENTENDI: 'nao_entendi',
});

const INTENT_POR_TIPO = Object.freeze({ saida: 'register_expense', entrada: 'register_income' });

// Frequência do uni-interpret → frequency da série (#222).
const FREQUENCY_POR_FREQUENCIA = Object.freeze({
  diaria: 'daily',
  semanal: 'weekly',
  mensal: 'monthly',
  anual: 'yearly',
});

function recorrenciaDaOperacao(operacao) {
  if (operacao?.recorrente !== true) return null;
  const frequency = FREQUENCY_POR_FREQUENCIA[operacao.frequencia];
  if (!frequency) return null;
  const intervalo = Number(operacao.intervalo);
  return {
    frequency,
    interval: Number.isInteger(intervalo) && intervalo >= 1 && intervalo <= MAX_RECURRENCE_INTERVAL ? intervalo : 1,
  };
}

// Parcela e recorrência com frequência vão para o plano, que cria a compra
// ou a série inteira. Recorrência sem frequência (ou de função anterior ao
// campo) vira o card deste lançamento: um falso positivo do modelo
// ("mensalidade do sistema") não pode bloquear o registro.
function ehLancamentoSimples(operacao) {
  return Object.hasOwn(INTENT_POR_TIPO, operacao?.tipo) && !operacao.parcelas && !recorrenciaDaOperacao(operacao);
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
      // operação, transferência, parcela ou recorrência vão para o plano,
      // que sabe revisar várias de uma vez.
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
    case 'categoria':
      return interpretacao.categoria?.acao ? ROTAS_INTERPRETACAO.CATEGORIA : ROTAS_INTERPRETACAO.NAO_ENTENDI;
    // Função antiga sem o bloco exclusao: as regras tentam, como antes.
    case 'exclusao':
      return interpretacao.exclusao ? ROTAS_INTERPRETACAO.EXCLUSAO : null;
    // Função antiga sem o bloco edicao: as regras tentam, como antes.
    case 'edicao':
      return interpretacao.edicao ? ROTAS_INTERPRETACAO.EDICAO : null;
    case 'recorrencia':
      return interpretacao.recorrencia?.acao ? ROTAS_INTERPRETACAO.RECORRENCIA : null;
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
  // com esse nome.
  if (novaCategoria) {
    overrides.categoryName = novaCategoria;
    overrides.categoryDecision = 'create_new';
  }
  if (operacao.conta?.id) overrides.accountId = operacao.conta.id;
  return { parsed, overrides };
}

// Recorrência sem frequência vira o lançamento comum, como numa operação só:
// um falso positivo do modelo não tira a operação do plano.
function tipoDaOperacaoDoPlano(operacao) {
  if (operacao.tipo === 'transferencia') return 'transfer';
  const recorrente = Boolean(recorrenciaDaOperacao(operacao));
  if (operacao.tipo === 'saida') {
    if (operacao.parcelas) return 'installment_purchase';
    return recorrente ? 'recurring_expense' : 'expense';
  }
  return recorrente ? 'recurring_income' : 'income';
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
      installments: operationType === 'installment_purchase' ? { count: operacao.parcelas } : null,
      recurrence: recorrenciaDaOperacao(operacao),
    };
  });
  return { operations, clarificationQuestion: null };
}

// Ações sobre um compromisso que já existe (#191), mais a consulta da agenda,
// que pode ou não citar um compromisso. Criar segue o caminho do título;
// função anterior ao campo não manda acao e cai no mesmo caminho.
const ACOES_SOBRE_COMPROMISSO = new Set(['editar', 'cancelar', 'concluir', 'excluir', 'consultar']);

function textoOuNulo(valor) {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  return texto || null;
}

// Compromisso → campos que o fluxo da agenda usa no lugar da regex (#142).
// O valor citado entra no título, que é o que aparece no Google Agenda e no
// lembrete, a não ser que o título já traga um número. null quando o modelo não deu título: a regex tenta ou a Uni
// pergunta. Com ação sobre um compromisso existente (#191), devolve a ação,
// o alvo e, em editar, o nome novo; o fluxo da agenda localiza o item.
export function interpretacaoParaAgenda(interpretacao) {
  if (escolherRotaDaInterpretacao(interpretacao) !== ROTAS_INTERPRETACAO.AGENDA) return null;
  if (ACOES_SOBRE_COMPROMISSO.has(interpretacao.agenda?.acao)) {
    return {
      acao: interpretacao.agenda.acao,
      alvo: textoOuNulo(interpretacao.agenda.alvo),
      titulo: interpretacao.agenda.acao === 'editar' ? textoOuNulo(interpretacao.agenda.titulo) : null,
    };
  }
  const titulo = textoOuNulo(interpretacao.agenda?.titulo) ?? '';
  if (!titulo) return null;
  const valor = Number(interpretacao.agenda.valor);
  if (Number.isFinite(valor) && valor > 0 && !/\d/.test(titulo)) {
    return { titulo: `${titulo} no valor de ${formatCurrency(valor)}` };
  }
  return { titulo };
}
