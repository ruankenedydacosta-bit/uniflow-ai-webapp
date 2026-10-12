// Exclusão de um lançamento já salvo, pedida em conversa ou por voz ("apaga
// o Uber de ontem", "exclui o mercado de sábado"). O uni-interpret diz qual
// lançamento a pessoa quer tirar; aqui, sem efeito colateral, o pedido vira
// os critérios da busca, o card que a pessoa confirma e os textos. Quem apaga
// é o chat, depois do Confirmar, e por alguns segundos dá para desfazer: o
// lançamento volta com os mesmos campos.
import {
  analisarAlvo,
  descreverLancamento,
  formatarData,
  formatarValor,
} from './edicaoDeLancamento.js';
import { normalizeSearchText } from '../../utils/searchText.js';
import { classifyPendingActionReply } from './pendingActionInput.js';

// actionKind do card (confirmationCardModel.js mostra o título).
export const ACTION_KIND_EXCLUSAO = 'delete_transaction';

// Janela para desfazer depois de apagar. Na voz, a Uni termina de falar a
// confirmação em uns 5 segundos e a pessoa ainda precisa reagir.
export const DESFAZER_EXCLUSAO_MS = 20 * 1000;

export const TEXTO_EXCLUSAO_EM_LOTE = 'Pela conversa eu excluo um lançamento por vez. Para apagar vários, use a tela Financeiro.';
export const TEXTO_EXCLUSAO_SEM_ALVO = 'Diga qual lançamento quer excluir, com o nome e o dia ou o valor. Por exemplo: "apaga o Uber de ontem".';

// Critérios da busca: o que o modelo leu (data resolvida, valor, conta) vale
// mais que a leitura por regex do texto do alvo, que fica só com as palavras.
export function alvoDaExclusao(exclusao, contexto = {}) {
  const base = analisarAlvo(exclusao?.alvo ?? '', contexto);
  const data = exclusao?.data ?? base.data ?? null;
  const valor = exclusao?.valor ?? base.valor ?? null;
  const contaId = exclusao?.conta?.id ?? base.contaId ?? null;
  const palavras = base.palavras ?? [];
  return {
    data,
    valor,
    contaId,
    palavras,
    criterios: [data, valor, contaId].filter(Boolean).length + palavras.length,
  };
}

// Por que a conversa não exclui este lançamento; null quando pode. Os mesmos
// casos da edição, com o verbo certo.
export function motivoDeBloqueioDaExclusao(transacao) {
  if (!transacao) return 'Não encontrei esse lançamento.';
  if (transacao.status === 'canceled') return 'Esse lançamento já está cancelado.';
  if (transacao.transaction_type === 'transfer') {
    return 'Transferências só podem ser excluídas na tela Financeiro.';
  }
  if (transacao.transaction_type === 'adjustment') {
    return 'Ajustes de saldo só podem ser excluídos na tela Financeiro.';
  }
  if (transacao.metadata?.installment_group_id || Number(transacao.installment_total) > 1) {
    return 'Esse lançamento é uma parcela. Exclua na tela Financeiro, que pergunta se vale também para as outras parcelas.';
  }
  if (transacao.source_type === 'import' || transacao.source_type === 'open_finance') {
    return 'Esse lançamento veio de uma importação e só pode ser excluído na tela Financeiro.';
  }
  return null;
}

function nomeDe(lista, id) {
  return (Array.isArray(lista) ? lista : []).find((item) => item?.id === id)?.name ?? null;
}

// Card de confirmação. Sem "Editar": ou exclui este, ou não.
export function cardDaExclusao(transacao, { accounts = [], categories = [] } = {}) {
  const rows = [
    { key: 'delete-target', label: 'Lançamento', value: transacao.description || 'Sem descrição' },
    { key: 'delete-amount', label: 'Valor', value: formatarValor(transacao.amount), emphasis: true },
    { key: 'delete-date', label: 'Data', value: formatarData(transacao.transaction_date) },
  ];
  const conta = nomeDe(accounts, transacao.account_id);
  if (conta) rows.push({ key: 'delete-account', label: 'Conta', value: conta });
  const categoria = nomeDe(categories, transacao.category_id);
  if (categoria) rows.push({ key: 'delete-category', label: 'Categoria', value: categoria });
  return {
    title: 'Excluir lançamento',
    status: 'pending',
    actionKind: ACTION_KIND_EXCLUSAO,
    editable: false,
    rows,
  };
}

// O que a Uni diz junto do card. É este texto que a conversa por voz fala.
export function textoDaExclusao(transacao, { accounts = [] } = {}) {
  return `Vou excluir ${descreverLancamento(transacao, { accounts })}. Posso excluir?`;
}

function nomeDoLancamento(transacao) {
  return transacao.description || (transacao.transaction_type === 'income' ? 'a receita' : 'a despesa');
}

export function textoDaExclusaoFeita(transacao) {
  const segundos = Math.round(DESFAZER_EXCLUSAO_MS / 1000);
  return `Pronto, excluí ${nomeDoLancamento(transacao)} de ${formatarData(transacao.transaction_date)}. Se foi engano, diga desfazer nos próximos ${segundos} segundos.`;
}

export function textoDaExclusaoDesfeita(transacao) {
  return `Pronto, ${nomeDoLancamento(transacao)} de ${formatarData(transacao.transaction_date)} voltou como estava.`;
}

export const TEXTO_DESFAZER_VENCIDO = 'O prazo para desfazer passou. Se quiser o lançamento de volta, registre de novo.';

// O card pergunta "Posso excluir?", e "pode excluir" ou "apaga sim" é a
// resposta natural. O classificador dos rascunhos só conhece "confirmar",
// "pode criar" e parecidos: aqui vale também o verbo da própria ação, sozinho
// ou com o nome do lançamento.
const VERBOS_DE_EXCLUIR = String.raw`exclu(?:ir|i|a)|apag(?:ar|a|ue)|remov(?:er|e|a)|tir(?:ar|a|e)|delet(?:ar|a|e)`;

export function respostaAoPedidoDeExclusao(texto, transacao) {
  const nome = transacao?.description || null;
  const resposta = classifyPendingActionReply(texto, { subjectName: nome });
  if (resposta !== 'input') return resposta;
  const frase = normalizeSearchText(texto).replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  const nomeNaFrase = nome ? `(?:\\s+(?:o|a|esse|essa)?\\s*(?:lancamento\\s+)?${escaparRegex(normalizeSearchText(nome))})?` : '';
  const confirmacao = new RegExp(
    String.raw`^(?:(?:sim|ok|isso|claro|beleza)\s+)?(?:pode\s+)?(?:${VERBOS_DE_EXCLUIR})(?:\s+(?:sim|ele|ela|esse|essa|isso))?` + nomeNaFrase + String.raw`(?:\s+(?:sim|por favor|mesmo))?$`,
  );
  return confirmacao.test(frase) ? 'confirm' : 'input';
}

// "desfazer", "desfaz isso", "não, volta o lançamento", "cancela a exclusão".
const PEDIDO_DE_DESFAZER = /^(?:(?:uni|ops|opa|ah|ei)[,.!]?\s+)*(?:nao[,.!]?\s+)?(?:(?:pode|quero|da pra|consegue)\s+)?(?:desfaz(?:er)?|desfaca|volta(?:r)?(?:\s+atras)?|restaura(?:r)?|cancela(?:r)?\s+(?:a\s+)?exclusao|recupera(?:r)?)(?:\s+(?:isso|essa\s+exclusao|a\s+exclusao|o\s+lancamento|esse\s+lancamento|ele|ela|por\s+favor|ai))*$/;

export function ehPedidoDeDesfazer(texto) {
  if (typeof texto !== 'string') return false;
  const frase = normalizeSearchText(texto).replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  return Boolean(frase) && PEDIDO_DE_DESFAZER.test(frase);
}

// Campos que o createTransaction aceita, lidos do lançamento antes de apagar.
// O id é novo; o resto volta igual.
const CAMPOS_RECRIAVEIS = [
  'account_id', 'destination_account_id', 'category_id', 'transaction_type', 'description', 'amount',
  'transaction_date', 'competence_date', 'status', 'payment_method', 'notes', 'is_recurring',
  'recurrence_rule', 'metadata',
];

export function camposParaRecriar(transacao) {
  return Object.fromEntries(
    CAMPOS_RECRIAVEIS
      .filter((campo) => transacao?.[campo] !== undefined && transacao?.[campo] !== null)
      .map((campo) => [campo, transacao[campo]]),
  );
}

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
