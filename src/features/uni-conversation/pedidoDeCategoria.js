// Criar, renomear ou excluir uma categoria pela conversa ou pela voz. O
// uni-interpret diz o que a pessoa pediu; aqui, sem efeito colateral, o
// pedido é conferido com as mesmas regras da tela Categorias (permissão,
// categoria padrão, nome repetido) e vira o card que a pessoa confirma. Quem
// grava é o chat, depois do Confirmar.
import { canManageCategory, isDuplicateCategoryName } from '../categories/categoryUtils.js';

// actionKind do card (confirmationCardModel.js mostra o título).
export const ACTION_KIND_CATEGORIA = 'manage_category';

export const ACOES_DE_CATEGORIA = Object.freeze({
  CRIAR: 'criar',
  RENOMEAR: 'renomear',
  EXCLUIR: 'excluir',
});

const CATEGORY_TYPE_POR_TIPO = Object.freeze({ saida: 'expense', entrada: 'income' });
const ROTULO_DO_TIPO = Object.freeze({ expense: 'Saída', income: 'Entrada' });
const TITULO_DO_CARD = Object.freeze({
  criar: 'Criar categoria',
  renomear: 'Renomear categoria',
  excluir: 'Excluir categoria',
});

const NOME_MAX = 40;

function nomeDeCategoria(nome) {
  const limpo = String(nome ?? '').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim().slice(0, NOME_MAX).trim();
  return limpo ? `${limpo.charAt(0).toUpperCase()}${limpo.slice(1)}` : '';
}

// pedido: { acao, tipo, alvo: { id, name } | null, nome } do uni-interpret.
// contexto: categorias do espaço (já filtradas como na tela), papel da
// pessoa ({ canUpdate, canDelete }), userId e o rótulo do espaço.
// Devolve { erro } com o texto para a pessoa, ou o pedido pronto para o card.
export function montarPedidoDeCategoria(pedido, {
  categorias = [],
  papel = {},
  userId = null,
  espaco = 'Pessoal',
} = {}) {
  const acao = pedido?.acao;
  const lista = Array.isArray(categorias) ? categorias : [];

  if (acao === ACOES_DE_CATEGORIA.CRIAR) {
    const nome = nomeDeCategoria(pedido.nome);
    const categoryType = CATEGORY_TYPE_POR_TIPO[pedido.tipo] ?? 'expense';
    if (!nome) return { erro: 'Diga o nome da categoria nova. Por exemplo: "cria a categoria Pets".' };
    if (papel.canUpdate !== true) return { erro: 'Você não tem permissão para criar categorias neste espaço.' };
    if (isDuplicateCategoryName(lista, nome, categoryType)) {
      return { erro: `A categoria ${nome} já existe. Ela já pode ser usada nos lançamentos.` };
    }
    return {
      acao,
      categoryType,
      nome,
      categoria: null,
      texto: `Vou criar a categoria ${nome}, de ${ROTULO_DO_TIPO[categoryType].toLowerCase()}. Posso criar?`,
      card: card(acao, [
        { label: 'Categoria', value: nome },
        { label: 'Tipo', value: ROTULO_DO_TIPO[categoryType] },
        { label: 'Espaço', value: espaco },
      ]),
    };
  }

  if (acao !== ACOES_DE_CATEGORIA.RENOMEAR && acao !== ACOES_DE_CATEGORIA.EXCLUIR) {
    return { erro: 'Não entendi o que fazer com a categoria. Diga se é para criar, renomear ou excluir.' };
  }

  const categoria = lista.find((item) => item?.id === pedido.alvo?.id) ?? null;
  if (!categoria) return { erro: 'Não encontrei essa categoria. Diga o nome como aparece em Categorias.' };
  if (categoria.is_system === true || !categoria.workspace_id) {
    return { erro: `${categoria.name} é uma categoria padrão do app e não pode ser renomeada nem excluída.` };
  }
  if (!canManageCategory(categoria, { ...papel, userId })) {
    return { erro: 'Você não tem permissão para mudar essa categoria. Peça a quem administra o espaço.' };
  }
  const tipo = ROTULO_DO_TIPO[categoria.category_type] ?? '';

  if (acao === ACOES_DE_CATEGORIA.EXCLUIR) {
    return {
      acao,
      categoryType: categoria.category_type,
      nome: null,
      categoria,
      texto: `Vou excluir a categoria ${categoria.name}. Posso excluir?`,
      card: card(acao, [
        { label: 'Categoria', value: categoria.name },
        { label: 'Tipo', value: tipo },
      ]),
    };
  }

  const nome = nomeDeCategoria(pedido.nome);
  if (!nome) return { erro: `Diga o nome novo. Por exemplo: "renomeia ${categoria.name} para Casa".` };
  if (nome === categoria.name) return { erro: `A categoria já se chama ${nome}.` };
  if (isDuplicateCategoryName(lista, nome, categoria.category_type, { excludeId: categoria.id })) {
    return { erro: `Já existe uma categoria chamada ${nome}. Escolha outro nome.` };
  }
  return {
    acao,
    categoryType: categoria.category_type,
    nome,
    categoria,
    texto: `Vou renomear a categoria ${categoria.name} para ${nome}. Posso confirmar?`,
    card: card(acao, [
      { label: 'De', value: categoria.name },
      { label: 'Para', value: nome },
      { label: 'Tipo', value: tipo },
    ]),
  };
}

function card(acao, rows) {
  return {
    title: TITULO_DO_CARD[acao],
    status: 'pending',
    actionKind: ACTION_KIND_CATEGORIA,
    editable: false,
    rows,
  };
}

// O que a Uni diz depois de gravar. É este texto que a voz fala.
export function textoDoPedidoFeito(pedidoPronto) {
  if (pedidoPronto.acao === ACOES_DE_CATEGORIA.CRIAR) {
    return `Categoria ${pedidoPronto.nome} criada. Ela já pode ser usada nos lançamentos.`;
  }
  if (pedidoPronto.acao === ACOES_DE_CATEGORIA.RENOMEAR) {
    return `Categoria ${pedidoPronto.categoria.name} renomeada para ${pedidoPronto.nome}.`;
  }
  return `Categoria ${pedidoPronto.categoria.name} excluída.`;
}
