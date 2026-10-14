// Teto de gasto mensal por categoria pela conversa ou pela voz (#264): "no
// máximo 600 por mês com delivery", "tira o limite de Vestuário", "quanto
// ainda posso gastar com transporte?". O teto é o mesmo de category_budgets
// que a tela Registros e a Leitura do mês usam. Tudo aqui é puro: quem lê e
// grava é o chat.
import { formatarValor } from './edicaoDeLancamento.js';

export const ACTION_KIND_ORCAMENTO = 'manage_budget';

export const TEXTO_ORCAMENTO_INCOMPLETO = 'Diga a categoria e o valor do teto. Por exemplo: "no máximo 600 por mês com Alimentação".';

function tetoDe(orcamentos, categoriaId) {
  const linha = (Array.isArray(orcamentos) ? orcamentos : []).find((item) => item.category_id === categoriaId);
  const valor = Number(linha?.monthly_limit);
  return valor > 0 ? valor : null;
}

// Gasto realizado da categoria no período já lido (o mês corrente).
export function gastoDaCategoria(transacoes, categoriaId) {
  return Math.round((Array.isArray(transacoes) ? transacoes : [])
    .filter((item) => item.status === 'completed' && item.transaction_type === 'expense' && item.category_id === categoriaId)
    .reduce((soma, item) => soma + Number(item.amount || 0), 0) * 100) / 100;
}

// pedido: { acao: 'definir' | 'remover', categoria: { id, name }, valor }.
// Devolve { erro } ou { texto, card, chamada, textoFeito }.
export function montarPedidoDeOrcamento(pedido, { orcamentos = [], papel = {} } = {}) {
  if (papel.canUpdate !== true) return { erro: 'Você não tem permissão para mudar tetos de gasto neste espaço.' };
  const { categoria } = pedido;
  const atual = tetoDe(orcamentos, categoria.id);

  if (pedido.acao === 'remover') {
    if (!atual) return { erro: `${categoria.name} não tem teto mensal. Nada mudou.` };
    return {
      texto: `Vou tirar o teto de ${formatarValor(atual)} por mês de ${categoria.name}. Posso confirmar?`,
      card: {
        title: 'Remover teto de gasto',
        status: 'pending',
        actionKind: ACTION_KIND_ORCAMENTO,
        editable: false,
        rows: [
          { key: 'budget-category', label: 'Categoria', value: categoria.name },
          { key: 'budget-limit', label: 'Teto mensal', value: `${formatarValor(atual)} → sem teto`, emphasis: true },
        ],
      },
      chamada: { acao: 'remover', categoriaId: categoria.id },
      textoFeito: `Pronto, ${categoria.name} ficou sem teto mensal.`,
    };
  }

  if (atual && Math.abs(atual - pedido.valor) < 0.005) {
    return { erro: `O teto de ${categoria.name} já é de ${formatarValor(atual)} por mês. Nada mudou.` };
  }
  return {
    texto: atual
      ? `Vou mudar o teto de ${categoria.name} de ${formatarValor(atual)} para ${formatarValor(pedido.valor)} por mês. Posso confirmar?`
      : `Vou definir um teto de ${formatarValor(pedido.valor)} por mês para ${categoria.name}. Posso confirmar?`,
    card: {
      title: atual ? 'Alterar teto de gasto' : 'Definir teto de gasto',
      status: 'pending',
      actionKind: ACTION_KIND_ORCAMENTO,
      editable: false,
      rows: [
        { key: 'budget-category', label: 'Categoria', value: categoria.name },
        {
          key: 'budget-limit',
          label: 'Teto mensal',
          value: atual ? `${formatarValor(atual)} → ${formatarValor(pedido.valor)}` : formatarValor(pedido.valor),
          emphasis: true,
        },
      ],
    },
    chamada: { acao: 'definir', categoriaId: categoria.id, valor: pedido.valor },
    textoFeito: `Pronto, o teto de ${categoria.name} é de ${formatarValor(pedido.valor)} por mês.`,
  };
}

function situacao(nome, gasto, teto) {
  const falta = Math.round((teto - gasto) * 100) / 100;
  if (falta > 0) return `${nome}: ${formatarValor(gasto)} de ${formatarValor(teto)}, faltam ${formatarValor(falta)}`;
  if (falta === 0) return `${nome}: ${formatarValor(gasto)} de ${formatarValor(teto)}, chegou no teto`;
  return `${nome}: ${formatarValor(gasto)} de ${formatarValor(teto)}, passou ${formatarValor(-falta)}`;
}

// Resposta a "quanto ainda posso gastar com X?" ou "como estão meus tetos?",
// com o gasto realizado do mês corrente.
export function respostaDaConsultaDeOrcamento(pedido, { orcamentos = [], categorias = [], transacoes = [] } = {}) {
  if (pedido.categoria) {
    const { categoria } = pedido;
    const teto = tetoDe(orcamentos, categoria.id);
    const gasto = gastoDaCategoria(transacoes, categoria.id);
    if (!teto) {
      return `${categoria.name} não tem teto mensal. Neste mês você gastou ${formatarValor(gasto)}. Para definir um, diga "no máximo 500 por mês com ${categoria.name}".`;
    }
    return `Neste mês, ${situacao(categoria.name, gasto, teto)}.`;
  }
  const nomes = new Map((Array.isArray(categorias) ? categorias : []).map((item) => [item.id, item.name]));
  const linhas = (Array.isArray(orcamentos) ? orcamentos : [])
    .filter((item) => Number(item.monthly_limit) > 0 && nomes.has(item.category_id))
    .map((item) => situacao(nomes.get(item.category_id), gastoDaCategoria(transacoes, item.category_id), Number(item.monthly_limit)))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (!linhas.length) return 'Você ainda não tem teto mensal em nenhuma categoria. Para definir um, diga "no máximo 500 por mês com Alimentação".';
  return `Seus tetos neste mês:\n${linhas.join('\n')}`;
}
