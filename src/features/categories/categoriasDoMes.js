// Lista de categorias da tela Organizar: valor e quantidade de lançamentos do
// mês por categoria. Lógica pura, sem React, para rodar em `node --test`.
import { resolveCategoryIconKey } from './categoryIconCatalog.js';

/**
 * Soma os lançamentos concluídos do tipo (saída ou entrada) por categoria.
 * Retorna as categorias com lançamento, da maior para a menor, e as sem
 * lançamento em ordem alfabética. `peso` é a fração do maior valor, para a
 * barra da linha. `ocultas` (#184) são as categorias escondidas no espaço:
 * saem das duas listas e voltam no grupo `ocultas`, em ordem alfabética, com
 * o valor do mês, que continua no total para bater com o Financeiro.
 */
export function montarListaDeCategorias({ categories, ocultas = [], transactions, type }) {
  const totais = new Map();
  const doTipo = (lista) => (Array.isArray(lista) ? lista : [])
    .filter((categoria) => categoria.is_active !== false && categoria.category_type === type);
  const visiveis = doTipo(categories);
  const escondidas = doTipo(ocultas);
  const idsDaLista = new Set([...visiveis, ...escondidas].map((categoria) => categoria.id));
  const semCategoria = { valor: 0, quantidade: 0 };
  for (const transacao of Array.isArray(transactions) ? transactions : []) {
    if (transacao.status !== 'completed' || transacao.transaction_type !== type) continue;
    // Sem categoria, ou numa categoria que não está na lista (inativa, de outro
    // contexto): conta no total do mês para bater com o Financeiro.
    if (!transacao.category_id || !idsDaLista.has(transacao.category_id)) {
      semCategoria.valor += Number(transacao.amount || 0);
      semCategoria.quantidade += 1;
      continue;
    }
    const atual = totais.get(transacao.category_id) ?? { valor: 0, quantidade: 0 };
    totais.set(transacao.category_id, {
      valor: atual.valor + Number(transacao.amount || 0),
      quantidade: atual.quantidade + 1,
    });
  }

  const montarLinha = (categoria) => {
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
  };
  const porNome = (a, b) => a.name.localeCompare(b.name, 'pt-BR');
  const linhas = visiveis.map(montarLinha);
  const linhasOcultas = escondidas.map(montarLinha).sort(porNome);

  const comLancamento = linhas
    .filter((linha) => linha.quantidade > 0)
    .sort((a, b) => b.valor - a.valor || porNome(a, b));
  const semLancamento = linhas
    .filter((linha) => linha.quantidade === 0)
    .sort(porNome);

  // A barra das ocultas usa a mesma escala das visíveis; uma oculta maior
  // que todas fica cheia.
  const maior = comLancamento[0]?.valor ?? 0;
  const comPeso = (linha) => ({
    ...linha,
    peso: maior > 0 ? Math.min(1, linha.valor / maior) : (linha.valor > 0 ? 1 : 0),
  });
  const totalDasOcultas = linhasOcultas.reduce((soma, linha) => soma + linha.valor, 0);
  return {
    total: comLancamento.reduce((soma, linha) => soma + linha.valor, semCategoria.valor + totalDasOcultas),
    semCategoria,
    comLancamento: comLancamento.map(comPeso),
    semLancamento,
    ocultas: linhasOcultas.map(comPeso),
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
