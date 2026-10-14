// Mudar ou encerrar um lançamento que se repete, pela conversa ou pela voz
// (#263): "a academia sobe pra 130 a partir de dezembro", "para de lançar o
// Spotify". O uni-interpret diz o que a pessoa pediu; aqui, sem efeito
// colateral, o pedido acha a série entre os previstos e vira o card que a
// pessoa confirma. Quem grava é o chat, com as RPCs da tela (escopo
// "este e os próximos").
import { analisarAlvo, bateComPalavras, formatarData, formatarValor } from './edicaoDeLancamento.js';

export const ACTION_KIND_RECORRENCIA = 'manage_recurrence';
export const ESCOPO_DA_SERIE = 'forward';

function serieDe(transacao) {
  return transacao?.metadata?.recurring_series_id ?? transacao?.recurring_series_id ?? null;
}

// previstos: lançamentos pendentes já lidos. A série é achada pelas palavras
// do alvo; a mudança começa no primeiro previsto a partir de aPartirDe.
// { tipo: 'nenhum' } | { tipo: 'varios', nomes } | { tipo: 'unico', serie }
// com serie = { id, primeiro, quantos }.
export function localizarSerie(alvo, previstos, { categories = [], aPartirDe = null, referenceDate } = {}) {
  const { palavras = [] } = analisarAlvo(alvo ?? '');
  if (!palavras.length) return { tipo: 'nenhum' };
  const inicio = aPartirDe && aPartirDe > referenceDate ? aPartirDe : referenceDate;
  const porSerie = new Map();
  for (const transacao of Array.isArray(previstos) ? previstos : []) {
    const id = serieDe(transacao);
    if (!id || transacao.status !== 'pending' || !bateComPalavras(transacao, palavras, categories)) continue;
    porSerie.set(id, [...(porSerie.get(id) ?? []), transacao]);
  }
  const series = [...porSerie.entries()]
    .map(([id, itens]) => {
      const proximos = itens
        .filter((item) => item.transaction_date >= inicio)
        .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
      return { id, primeiro: proximos[0] ?? null, quantos: proximos.length };
    })
    .filter((serie) => serie.primeiro);
  if (!series.length) return { tipo: 'nenhum' };
  if (series.length > 1) return { tipo: 'varios', nomes: series.map((serie) => serie.primeiro.description) };
  return { tipo: 'unico', serie: series[0] };
}

function plural(quantos) {
  return quantos === 1 ? '1 lançamento previsto' : `${quantos} lançamentos previstos`;
}

// pedido: { acao, novoValor, novaCategoria, novaConta } do uni-interpret.
// Devolve { erro } ou { texto, card, chamada, textoFeito }. chamada diz qual
// RPC o chat usa e com quais argumentos.
export function montarPedidoDeRecorrencia(pedido, serie, { accounts = [], categories = [] } = {}) {
  const { primeiro, quantos } = serie;
  const nome = primeiro.description || 'esse lançamento';
  const desde = formatarData(primeiro.transaction_date);
  const linhas = [
    { key: 'recurrence-target', label: 'Lançamento', value: nome },
    { key: 'recurrence-from', label: 'A partir de', value: desde },
    { key: 'recurrence-count', label: 'Previstos', value: String(quantos) },
  ];

  if (pedido.acao === 'encerrar') {
    return {
      texto: `Vou encerrar ${nome}: ${plural(quantos)} a partir de ${desde} saem e a série para de gerar novos. Os já realizados ficam. Posso confirmar?`,
      card: { title: 'Encerrar recorrência', status: 'pending', actionKind: ACTION_KIND_RECORRENCIA, editable: false, rows: linhas },
      chamada: { rpc: 'excluir', transacaoId: primeiro.id, escopo: ESCOPO_DA_SERIE },
      textoFeito: `Pronto, encerrei ${nome}. Não entram novos lançamentos dele.`,
    };
  }

  const mudancas = [];
  const alteracoes = {
    account_id: primeiro.account_id ?? null,
    category_id: primeiro.category_id ?? null,
    description: primeiro.description,
    amount: Number(primeiro.amount),
    payment_method: primeiro.payment_method ?? null,
    notes: primeiro.notes ?? null,
  };
  if (pedido.novoValor && Math.abs(pedido.novoValor - Number(primeiro.amount)) >= 0.005) {
    alteracoes.amount = pedido.novoValor;
    mudancas.push(['Valor', formatarValor(primeiro.amount), formatarValor(pedido.novoValor)]);
  }
  if (pedido.novaCategoria?.id && pedido.novaCategoria.id !== primeiro.category_id) {
    const categoria = categories.find((item) => item.id === pedido.novaCategoria.id);
    if (!categoria || categoria.is_active === false) return { erro: 'Essa categoria não está ativa neste espaço.' };
    if (categoria.category_type !== primeiro.transaction_type) {
      return { erro: `${categoria.name} não é do mesmo tipo de ${nome}. Escolha uma categoria de ${primeiro.transaction_type === 'income' ? 'entrada' : 'saída'}.` };
    }
    alteracoes.category_id = categoria.id;
    const antes = categories.find((item) => item.id === primeiro.category_id)?.name ?? 'sem categoria';
    mudancas.push(['Categoria', antes, categoria.name]);
  }
  if (pedido.novaConta?.id && pedido.novaConta.id !== primeiro.account_id) {
    const conta = accounts.find((item) => item.id === pedido.novaConta.id);
    if (!conta || conta.is_active === false) return { erro: 'Essa conta não está ativa neste espaço.' };
    alteracoes.account_id = conta.id;
    const antes = accounts.find((item) => item.id === primeiro.account_id)?.name ?? 'sem conta';
    mudancas.push(['Conta', antes, conta.name]);
  }
  if (!mudancas.length) return { erro: `${nome} já está assim. Nada mudou.` };

  const lista = mudancas.map(([rotulo, antes, depois]) => `${rotulo.toLowerCase()} de ${antes} para ${depois}`).join(' e ');
  return {
    texto: `Vou mudar ${nome} a partir de ${desde}: ${lista}. Vale para ${plural(quantos)} e para os próximos que a série gerar. Posso confirmar?`,
    card: {
      title: 'Alterar recorrência',
      status: 'pending',
      actionKind: ACTION_KIND_RECORRENCIA,
      editable: false,
      rows: [
        ...linhas,
        ...mudancas.map(([rotulo, antes, depois]) => ({
          key: `recurrence-change-${rotulo}`,
          label: rotulo,
          value: `${antes} → ${depois}`,
          emphasis: true,
        })),
      ],
    },
    chamada: { rpc: 'alterar', transacaoId: primeiro.id, escopo: ESCOPO_DA_SERIE, alteracoes },
    textoFeito: `Pronto, alterei ${nome} a partir de ${desde}.`,
  };
}
