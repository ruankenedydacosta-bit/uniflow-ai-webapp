// Criar, renomear, arquivar e reativar conta pela conversa ou pela voz
// (#266). O uni-interpret diz o que a pessoa pediu; aqui, sem efeito
// colateral, o pedido é conferido com as regras da tela Contas (nome
// repetido, conta do Open Finance, cartão com folha própria) e vira o card
// que a pessoa confirma. Quem grava é o chat. Excluir conta e ajustar saldo
// ficam na tela.
import { ehContaDoOpenFinance, rotuloDoTipo, TIPO_CARTAO } from '../contas/contasOrganizar.js';
import { normalizeSearchText } from '../../utils/searchText.js';
import { findAccountCreationConflicts } from './financialPendingActionFlow.js';

export const ACTION_KIND_CONTA = 'manage_account';

const TIPO_PADRAO = 'checking';
const NOME_MAX = 60;

const TITULO_DO_CARD = Object.freeze({
  criar: 'Criar conta',
  renomear: 'Renomear conta',
  arquivar: 'Arquivar conta',
  reativar: 'Reativar conta',
});

function nomeDeConta(nome) {
  const limpo = String(nome ?? '').replace(/["“”]/g, '').replace(/^conta\s+(?:d[oa]\s+)?/i, '').replace(/\s+/g, ' ').trim().slice(0, NOME_MAX).trim();
  return limpo ? `${limpo.charAt(0).toUpperCase()}${limpo.slice(1)}` : '';
}

function doEspaco(contas, workspaceId) {
  return (Array.isArray(contas) ? contas : []).filter((conta) => !workspaceId || !conta.workspace_id || conta.workspace_id === workspaceId);
}

// A conta de que a pessoa fala: pelo apelido que o modelo resolveu ou, sem
// ele, pelo nome dito, entre as ativas ou as arquivadas.
function acharConta(pedido, contas, { ativa }) {
  const candidatas = contas.filter((conta) => (conta.is_active !== false) === ativa);
  if (pedido.alvo?.id) return candidatas.find((conta) => conta.id === pedido.alvo.id) ?? null;
  const nome = normalizeSearchText(nomeDeConta(pedido.nome));
  if (!nome) return null;
  const exatas = candidatas.filter((conta) => normalizeSearchText(conta.name) === nome);
  if (exatas.length === 1) return exatas[0];
  const parecidas = candidatas.filter((conta) => normalizeSearchText(conta.name).includes(nome));
  return parecidas.length === 1 ? parecidas[0] : null;
}

function card(acao, linhas) {
  return { title: TITULO_DO_CARD[acao], status: 'pending', actionKind: ACTION_KIND_CONTA, editable: false, rows: linhas };
}

// Nome que já existe neste espaço, ativo ou arquivado, ou parecido demais.
// findAccountCreationConflicts só olha as ativas; a arquivada com o mesmo
// nome é conferida antes.
function conflitoDeNome(nome, contas, workspaceId, ignorarId = null) {
  const outras = contas.filter((conta) => conta.id !== ignorarId);
  const arquivada = outras.find((conta) => conta.is_active === false && normalizeSearchText(conta.name) === normalizeSearchText(nome));
  if (arquivada) {
    return `Já existe a conta ${arquivada.name}, arquivada. Para voltar a usar, diga "reativa a conta ${arquivada.name}".`;
  }
  const { exact, similar } = findAccountCreationConflicts({ accounts: outras, requestedName: nome, workspaceId });
  const [igual] = exact;
  if (igual) return `A conta ${igual.name} já existe. Ela já pode ser usada nos lançamentos.`;
  if (similar.length) {
    return `Já existe uma conta parecida: ${similar.map((conta) => conta.name).join(', ')}. Use essa conta ou diga um nome diferente.`;
  }
  return null;
}

// pedido: { acao, alvo: { id, name } | null, nome, accountType } do
// uni-interpret. contexto: todas as contas do espaço (ativas e arquivadas),
// papel da pessoa e workspaceId. Devolve { erro } ou { texto, card,
// chamada: { valores, contaId }, textoFeito }.
export function montarPedidoDeConta(pedido, { contas = [], papel = {}, workspaceId = null } = {}) {
  if (papel.canUpdate !== true) return { erro: 'Você não tem permissão para mudar contas neste espaço.' };
  const lista = doEspaco(contas, workspaceId);

  if (pedido.acao === 'criar') {
    const nome = nomeDeConta(pedido.nome);
    if (!nome) return { erro: 'Diga o nome da conta nova. Por exemplo: "cria a conta Inter".' };
    if (pedido.accountType === TIPO_CARTAO) {
      return { erro: 'Cartão de crédito precisa do dia de fechamento e do vencimento. Crie o cartão na tela Contas.' };
    }
    const conflito = conflitoDeNome(nome, lista, workspaceId);
    if (conflito) return { erro: conflito };
    const accountType = pedido.accountType ?? TIPO_PADRAO;
    return {
      texto: `Vou criar a conta ${nome}, do tipo ${rotuloDoTipo(accountType).toLowerCase()}, com saldo zero. Posso criar?`,
      card: card('criar', [
        { key: 'account-name', label: 'Conta', value: nome, emphasis: true },
        { key: 'account-type', label: 'Tipo', value: rotuloDoTipo(accountType) },
      ]),
      chamada: { valores: { name: nome, account_type: accountType }, contaId: null },
      textoFeito: `Pronto, criei a conta ${nome}. Para acertar o saldo, use a tela Contas.`,
    };
  }

  const ativa = pedido.acao !== 'reativar';
  const conta = acharConta(pedido, lista, { ativa });
  if (!conta) {
    const citada = nomeDeConta(pedido.nome ?? pedido.alvo?.name) || 'essa conta';
    return {
      erro: ativa
        ? `Não achei a conta ${citada} entre as ativas. Diga o nome como aparece em Contas.`
        : `Não achei a conta ${citada} entre as arquivadas. Diga o nome como aparece em Contas.`,
    };
  }
  if (ehContaDoOpenFinance(conta)) {
    return { erro: `A conta ${conta.name} vem do Open Finance. Ela só muda pela tela Contas.` };
  }

  if (pedido.acao === 'renomear') {
    const nome = nomeDeConta(pedido.nome);
    if (!nome) return { erro: `Diga o nome novo da conta ${conta.name}.` };
    if (normalizeSearchText(nome) === normalizeSearchText(conta.name)) return { erro: `A conta já se chama ${conta.name}. Nada mudou.` };
    const conflito = conflitoDeNome(nome, lista, workspaceId, conta.id);
    if (conflito) return { erro: conflito };
    return {
      texto: `Vou renomear a conta ${conta.name} para ${nome}. Posso confirmar?`,
      card: card('renomear', [{ key: 'account-name', label: 'Conta', value: `${conta.name} → ${nome}`, emphasis: true }]),
      chamada: { valores: { name: nome }, contaId: conta.id },
      textoFeito: `Pronto, a conta ${conta.name} agora se chama ${nome}.`,
    };
  }

  if (pedido.acao === 'arquivar') {
    return {
      texto: `Vou arquivar a conta ${conta.name}. Ela sai das escolhas de conta, e os lançamentos dela continuam no Financeiro. Posso confirmar?`,
      card: card('arquivar', [{ key: 'account-name', label: 'Conta', value: conta.name, emphasis: true }]),
      chamada: { valores: { is_active: false }, contaId: conta.id },
      textoFeito: `Pronto, arquivei a conta ${conta.name}.`,
    };
  }

  return {
    texto: `Vou reativar a conta ${conta.name}. Ela volta para as escolhas de conta. Posso confirmar?`,
    card: card('reativar', [{ key: 'account-name', label: 'Conta', value: conta.name, emphasis: true }]),
    chamada: { valores: { is_active: true }, contaId: conta.id },
    textoFeito: `Pronto, a conta ${conta.name} está ativa de novo.`,
  };
}
