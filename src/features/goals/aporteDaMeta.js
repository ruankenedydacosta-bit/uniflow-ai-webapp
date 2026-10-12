import { formatCurrency } from '../../utils/formatters.js';
import { dataIsoLocal } from './criacaoDeMeta.js';
import { numerosDaMeta } from './detalheDaMeta.js';

// Folha de aporte e de retirada (handoff 08f, #158). Funções puras; `hoje`
// entra por parâmetro para o teste fixar a data.
//
// Decisões do dono (11/10/2026, na #158): "Registrar também no Financeiro"
// vem ligado e lança uma transferência entre a conta escolhida e a conta
// vinculada da meta; retirada abaixo de zero ou em meta concluída é
// bloqueada. O banco confere as mesmas regras (migration 064).

export const MOVIMENTOS = Object.freeze({ APORTE: 'aporte', RETIRADA: 'retirada' });

const MENSAGENS_DO_BANCO = {
  meta_nao_encontrada: 'Esta meta não existe mais.',
  meta_concluida: 'A meta está concluída e não recebe aporte nem retirada.',
  meta_nao_recebe_aporte: 'Retome a meta para registrar um aporte.',
  retirada_maior_que_guardado: 'A retirada passa do valor guardado na meta.',
  meta_sem_conta_vinculada: 'A meta não tem conta vinculada. Desligue "Registrar também no Financeiro" ou vincule uma conta em Editar meta.',
  conta_de_origem_invalida: 'Escolha uma conta diferente da conta vinculada à meta.',
  aporte_nao_encontrado: 'Este aporte já foi excluído.',
};

function centavos(valor) {
  return Math.round(Number(valor || 0) * 100);
}

// Valor que a folha de aporte já traz preenchido: o do mês.
export function valorSugerido(meta, movimento) {
  if (movimento !== MOVIMENTOS.APORTE) return 0;
  const { porMes } = numerosDaMeta(meta);
  return porMes ? centavos(porMes) : 0;
}

// Atalhos de valor abaixo do campo, em centavos. Aporte: o valor do mês e o
// que falta. Retirada: tudo o que está guardado.
export function atalhosDeValor(meta, movimento) {
  const { guardado, falta, porMes } = numerosDaMeta(meta);
  if (movimento === MOVIMENTOS.RETIRADA) {
    return guardado > 0 ? [{ value: centavos(guardado), label: 'Tudo o que está guardado' }] : [];
  }
  const atalhos = [];
  if (porMes) atalhos.push({ value: centavos(porMes), label: 'Valor do mês' });
  if (falta > 0 && centavos(falta) !== centavos(porMes)) {
    atalhos.push({ value: centavos(falta), label: 'Tudo o que falta' });
  }
  return atalhos;
}

// A transferência no Financeiro precisa da conta vinculada da meta e de
// outra conta para a ponta oposta. `contas` são as contas ativas do espaço.
export function transferenciaDaMeta(meta, contas) {
  const vinculada = contas.find((conta) => conta.id === meta.linked_account_id) ?? null;
  if (!vinculada) {
    return {
      disponivel: false,
      vinculada: null,
      contas: [],
      motivo: 'Para lançar a transferência no Financeiro, vincule uma conta à meta em Editar meta.',
    };
  }
  const outras = contas.filter((conta) => conta.id !== vinculada.id);
  if (outras.length === 0) {
    return {
      disponivel: false,
      vinculada,
      contas: [],
      motivo: 'Para lançar a transferência no Financeiro, cadastre outra conta além da conta da meta.',
    };
  }
  return { disponivel: true, vinculada, contas: outras, motivo: null };
}

export function erroDoMovimento(formulario, meta, hoje = new Date()) {
  const valor = formulario.centavos / 100;
  if (!(valor > 0)) return 'Informe o valor.';
  if (formulario.movimento === MOVIMENTOS.RETIRADA) {
    const guardado = Number(meta.current_amount || 0);
    if (valor > guardado) return `A retirada passa do valor guardado (${formatCurrency(guardado)}).`;
  }
  if (!formulario.data) return 'Escolha a data.';
  if (formulario.data > dataIsoLocal(hoje)) return 'Escolha uma data até hoje.';
  if (formulario.registrarNoFinanceiro && !formulario.contaId) {
    return formulario.movimento === MOVIMENTOS.RETIRADA ? 'Escolha a conta de destino.' : 'Escolha a conta de origem.';
  }
  return null;
}

// Payload de addContribution. Retirada vai com valor negativo.
export function montarMovimento(formulario, clientOperationId) {
  const valor = formulario.centavos / 100;
  return {
    amount: formulario.movimento === MOVIMENTOS.RETIRADA ? -valor : valor,
    contribution_date: formulario.data,
    note: formulario.observacao.trim() || undefined,
    linked_account_id: formulario.registrarNoFinanceiro ? formulario.contaId : undefined,
    registrar_no_financeiro: formulario.registrarNoFinanceiro,
    client_operation_id: clientOperationId,
  };
}

export function mensagemDoErro(error, movimento) {
  const mensagem = MENSAGENS_DO_BANCO[error?.message];
  if (mensagem) return mensagem;
  return movimento === MOVIMENTOS.RETIRADA
    ? 'Não foi possível registrar a retirada. Tente de novo.'
    : 'Não foi possível registrar o aporte. Tente de novo.';
}

// Excluir um aporte com retirada depois dele deixaria a meta abaixo de zero.
export function mensagemDoErroAoExcluir(error) {
  if (error?.message === 'retirada_maior_que_guardado') {
    return 'Excluir este aporte deixaria a meta abaixo de zero. Exclua antes a retirada feita depois dele.';
  }
  return MENSAGENS_DO_BANCO[error?.message] ?? 'Não foi possível excluir. Tente de novo.';
}
