import { formatCurrency } from '../../utils/formatters.js';
import { MESES_MAXIMOS_DO_PLANO, somarMeses, textoDoMes } from './criacaoDeMeta.js';
import { calcRemaining, calcRequiredMonthlyAmount, calcRhythmStatus } from './goalCalc.js';
import { lerData } from './listaDeMetas.js';

// Detalhe da meta (handoff 08e, #157). Funções puras; `hoje` entra por
// parâmetro para o teste fixar a data.

export const APORTES_DA_PREVISAO = 3;

const FORMATO_DIA_MES = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });
const FORMATO_DIA_MES_ANO = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });

function plural(quantidade, singular, pluralForma) {
  return `${quantidade} ${quantidade === 1 ? singular : pluralForma}`;
}

// Os três números abaixo do anel. O valor por mês segue o da lista: com
// data-alvo, o que falta dividido pelos meses restantes; sem ela, o
// planejado.
export function numerosDaMeta(meta) {
  const guardado = Number(meta.current_amount || 0);
  const falta = calcRemaining(guardado, Number(meta.target_amount || 0));
  const mensal = falta > 0 ? calcRequiredMonthlyAmount(meta) : 0;
  const alvo = lerData(meta.target_date);
  return {
    guardado,
    falta,
    porMes: mensal > 0 ? Math.ceil(mensal) : null,
    data: alvo ? textoDoMes(alvo.getFullYear(), alvo.getMonth()) : null,
  };
}

export function precisaDeAjuste(meta) {
  if (meta.status !== 'active') return false;
  const ritmo = calcRhythmStatus(meta);
  return ritmo === 'attention' || ritmo === 'late';
}

// Previsão da Uni: a média dos últimos 3 aportes (handoff 08e) vira o valor
// por mês, e o que falta dividido por ela dá o mês de chegada. `aportes`
// vem do listContributions, do mais recente para o mais antigo.
export function previsaoDaUni(meta, aportes, hoje = new Date()) {
  if (meta.status === 'completed') return null;
  const falta = calcRemaining(Number(meta.current_amount || 0), Number(meta.target_amount || 0));
  if (falta <= 0) return null;

  const ultimos = aportes.filter((aporte) => Number(aporte.amount) > 0).slice(0, APORTES_DA_PREVISAO);
  if (ultimos.length === 0) return 'Registre um aporte para a Uni prever quando você chega lá.';

  const centavos = ultimos.reduce((soma, aporte) => soma + Math.round(Number(aporte.amount) * 100), 0);
  const media = Math.round(centavos / ultimos.length) / 100;
  const meses = Math.ceil(falta / media);
  const base = ultimos.length === 1
    ? `Pelo último aporte (${formatCurrency(media)})`
    : `Pela média dos últimos ${ultimos.length} aportes (${formatCurrency(media)})`;
  if (meses > MESES_MAXIMOS_DO_PLANO) return `${base}, a meta levaria mais de 50 anos.`;

  const chegada = somarMeses(hoje, meses);
  const frase = `${base}, você chega lá em ${textoDoMes(chegada.getFullYear(), chegada.getMonth())}.`;

  const alvo = lerData(meta.target_date);
  if (!alvo) return frase;
  const atraso = (chegada.getFullYear() - alvo.getFullYear()) * 12 + (chegada.getMonth() - alvo.getMonth());
  if (atraso > 0) return `${frase} Isso é ${plural(atraso, 'mês', 'meses')} depois do prazo.`;
  return `${frase} Isso fica dentro do prazo.`;
}

export function dataDoAporte(valor, hoje = new Date()) {
  const data = lerData(valor);
  if (!data) return '';
  const formato = data.getFullYear() === hoje.getFullYear() ? FORMATO_DIA_MES : FORMATO_DIA_MES_ANO;
  return formato.format(data).replace(/\./g, '');
}
