// Rota de uma frase nova a partir da interpretação do uni-interpret (#80).
//
// O modelo decide o que a pessoa quer; as regras fixas só rodam quando não
// há interpretação (IA desligada, teto atingido, erro, tempo esgotado).
// Antes, a regex decidia a intenção e o modelo só corrigia os campos: frase
// com verbo fora da lista ("fazer um lançamento de 350") caía no chat geral,
// que respondia "não consigo registrar".

import { normalizeFinancialText } from '../uni-intents/index.js';

export const ROTAS_INTERPRETACAO = Object.freeze({
  LANCAMENTO: 'lancamento',
  PLANO: 'plano',
  CONSULTA: 'consulta',
  AGENDA: 'agenda',
  CONVERSA: 'conversa',
  NAO_ENTENDI: 'nao_entendi',
});

const INTENT_POR_TIPO = Object.freeze({ saida: 'register_expense', entrada: 'register_income' });

// null quando não há interpretação utilizável: o chamador segue com as
// regras fixas.
export function escolherRotaDaInterpretacao(interpretacao) {
  if (!interpretacao || typeof interpretacao.intent !== 'string') return null;
  const operacoes = Array.isArray(interpretacao.operacoes) ? interpretacao.operacoes : [];

  switch (interpretacao.intent) {
    case 'lancamento':
    case 'correcao':
      // Sem rascunho na tela, "correcao" é um lançamento novo. Mais de uma
      // operação ou transferência vai para o plano, que sabe revisar várias
      // de uma vez.
      if (operacoes.length === 1 && Object.hasOwn(INTENT_POR_TIPO, operacoes[0]?.tipo)) {
        return ROTAS_INTERPRETACAO.LANCAMENTO;
      }
      return operacoes.length > 0 ? ROTAS_INTERPRETACAO.PLANO : ROTAS_INTERPRETACAO.NAO_ENTENDI;
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
