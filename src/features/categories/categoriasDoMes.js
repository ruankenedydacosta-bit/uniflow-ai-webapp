// Lista de categorias da tela Organizar: valor e quantidade de lançamentos do
// mês por categoria. Lógica pura, sem React, para rodar em `node --test`.
import { resolveCategoryIconKey } from './categoryIconCatalog.js';

/**
 * Soma os lançamentos concluídos do tipo (saída ou entrada) por categoria.
 * Retorna as categorias com lançamento, da maior para a menor, e as sem
 * lançamento em ordem alfabética. `peso` é a fração do maior valor, para a
 * barra da linha.
 */
export function montarListaDeCategorias({ categories, transactions, type }) {
  const totais = new Map();
  for (const transacao of Array.isArray(transactions) ? transactions : []) {
    if (transacao.status !== 'completed' || transacao.transaction_type !== type) continue;
    if (!transacao.category_id) continue;
    const atual = totais.get(transacao.category_id) ?? { valor: 0, quantidade: 0 };
    totais.set(transacao.category_id, {
      valor: atual.valor + Number(transacao.amount || 0),
      quantidade: atual.quantidade + 1,
    });
  }

  const linhas = (Array.isArray(categories) ? categories : [])
    .filter((categoria) => categoria.is_active !== false && categoria.category_type === type)
    .map((categoria) => {
      const total = totais.get(categoria.id) ?? { valor: 0, quantidade: 0 };
      return {
        id: categoria.id,
        name: categoria.name,
        category_type: categoria.category_type,
        icon: resolveCategoryIconKey(categoria),
        valor: total.valor,
        quantidade: total.quantidade,
        criadaPeloUsuario: Boolean(categoria.workspace_id) && categoria.is_system !== true,
      };
    });

  const comLancamento = linhas
    .filter((linha) => linha.quantidade > 0)
    .sort((a, b) => b.valor - a.valor || a.name.localeCompare(b.name, 'pt-BR'));
  const semLancamento = linhas
    .filter((linha) => linha.quantidade === 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const maior = comLancamento[0]?.valor ?? 0;
  return {
    total: comLancamento.reduce((soma, linha) => soma + linha.valor, 0),
    comLancamento: comLancamento.map((linha) => ({
      ...linha,
      peso: maior > 0 ? linha.valor / maior : 0,
    })),
    semLancamento,
  };
}

/** Lançamentos concluídos de uma categoria, do mais recente para o mais antigo. */
export function lancamentosDaCategoria(transactions, categoryId) {
  return (Array.isArray(transactions) ? transactions : [])
    .filter((t) => t.category_id === categoryId && t.status === 'completed')
    .sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date)));
}

/** Total e quantidade dos lançamentos de uma categoria num mês já filtrado. */
export function resumoDaCategoria(transactions, categoryId) {
  const lista = lancamentosDaCategoria(transactions, categoryId);
  return {
    valor: lista.reduce((soma, t) => soma + Number(t.amount || 0), 0),
    quantidade: lista.length,
  };
}
