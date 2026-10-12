import { formatCurrency } from '../../utils/formatters.js';
import { calcularPlano, MESES_MAXIMOS_DO_PLANO, textoDoMes } from './criacaoDeMeta.js';
import { calcRemainingMonths, lerData } from './goalCalc.js';

// Folha "Ajustar plano" (handoff 08g, #159), aberta quando a meta fica em
// Atenção ou Atrasada. Cada opção traz o efeito calculado e as alterações
// que o updateGoal grava. Funções puras; `hoje` entra por parâmetro para o
// teste fixar a data.
//
// As contas seguem o ritmo pelo plano do goalCalc: depois de salvar
// qualquer uma das três primeiras opções, os aportes planejados cobrem o
// que falta até a data, e a meta volta para No ritmo.

export const AJUSTES = Object.freeze({
  MENSAL: 'mensal',
  DATA: 'data',
  VALOR: 'valor',
  PAUSAR: 'pausar',
});

function centavos(valor) {
  return Math.round(Number(valor || 0) * 100);
}

function mesDaData(valor) {
  const data = lerData(valor);
  return data ? textoDoMes(data.getFullYear(), data.getMonth()) : null;
}

// Guardar o valor necessário por mês, com a data mantida.
function ajusteMensal(falta, meses, mesDoPrazo) {
  const base = { value: AJUSTES.MENSAL, titulo: 'Guardar mais por mês' };
  if (!meses) return { ...base, descricao: 'O prazo já passou. Para manter esta opção, mude a data.', alteracoes: null };
  const porMes = Math.ceil(falta / meses);
  return {
    ...base,
    descricao: `Guarde ${formatCurrency(porMes)} por mês e chegue lá em ${mesDoPrazo}.`,
    alteracoes: { planned_monthly_amount: porMes },
  };
}

// Mudar a data, com o valor por mês mantido. A conta é a da criação no modo
// "Valor por mês": a data-alvo vira o último dia do mês em que o valor
// cobre o que falta.
function ajusteDeData(guardado, alvo, planejado, hoje) {
  const base = { value: AJUSTES.DATA, titulo: 'Mudar a data' };
  if (!planejado) return { ...base, descricao: 'A meta não tem valor por mês definido. Escolha antes quanto guardar por mês.', alteracoes: null };
  const plano = calcularPlano({ alvo, guardado, modo: 'mensal', porMes: planejado, hoje });
  if (!plano || plano.meses > MESES_MAXIMOS_DO_PLANO) {
    return { ...base, descricao: `Com ${formatCurrency(planejado)} por mês, a meta levaria mais de 50 anos.`, alteracoes: null };
  }
  return {
    ...base,
    descricao: `Guardando ${formatCurrency(planejado)} por mês, você chega lá em ${plano.textoDoPrazo}.`,
    alteracoes: { target_date: plano.dataAlvo },
  };
}

// Reduzir a meta ao que os aportes planejados alcançam até a data.
function ajusteDeValor(guardado, alvo, planejado, meses, mesDoPrazo) {
  const base = { value: AJUSTES.VALOR, titulo: 'Reduzir a meta' };
  if (!meses) return { ...base, descricao: 'O prazo já passou. Para manter esta opção, mude a data.', alteracoes: null };
  if (!planejado) return { ...base, descricao: 'A meta não tem valor por mês definido. Escolha antes quanto guardar por mês.', alteracoes: null };
  const novoAlvo = (centavos(guardado) + centavos(planejado) * meses) / 100;
  if (centavos(novoAlvo) >= centavos(alvo)) {
    return { ...base, descricao: `Com ${formatCurrency(planejado)} por mês, a meta atual já fecha em ${mesDoPrazo}.`, alteracoes: null };
  }
  return {
    ...base,
    descricao: `A meta passa para ${formatCurrency(novoAlvo)}, guardando ${formatCurrency(planejado)} por mês até ${mesDoPrazo}.`,
    alteracoes: { target_amount: novoAlvo },
  };
}

// As quatro opções da folha, na ordem do handoff. Opção com `alteracoes`
// nulo aparece desabilitada, com o motivo na descrição.
export function opcoesDeAjuste(meta, hoje = new Date()) {
  const guardado = Number(meta.current_amount || 0);
  const alvo = Number(meta.target_amount || 0);
  const falta = Math.max(centavos(alvo) - centavos(guardado), 0) / 100;
  const planejado = Number(meta.planned_monthly_amount) > 0 ? Number(meta.planned_monthly_amount) : null;
  const meses = calcRemainingMonths(meta.target_date, hoje) ?? 0;
  const mesDoPrazo = mesDaData(meta.target_date);

  return [
    ajusteMensal(falta, meses, mesDoPrazo),
    ajusteDeData(guardado, alvo, planejado, hoje),
    ajusteDeValor(guardado, alvo, planejado, meses, mesDoPrazo),
    {
      value: AJUSTES.PAUSAR,
      titulo: 'Pausar a meta',
      descricao: 'Os lembretes param até você retomar a meta.',
      alteracoes: { status: 'paused' },
    },
  ];
}

export function primeiraOpcaoDisponivel(opcoes) {
  return opcoes.find((opcao) => opcao.alteracoes)?.value ?? null;
}

export function mensagemDoErroAoAjustar(ajuste) {
  return ajuste === AJUSTES.PAUSAR
    ? 'Não foi possível pausar a meta. Tente de novo.'
    : 'Não foi possível ajustar o plano. Tente de novo.';
}
