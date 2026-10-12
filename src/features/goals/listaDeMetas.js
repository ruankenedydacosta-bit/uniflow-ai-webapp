import { formatCurrency } from '../../utils/formatters.js';
import { calcProgress, calcRemaining, calcRequiredMonthlyAmount, calcRhythmStatus, lerData, mesesEntre } from './goalCalc.js';

// lerData e mesesEntre moram no goalCalc, que também conta o ritmo; os
// outros módulos de Metas seguem importando daqui.
export { lerData, mesesEntre };

// Apresentação da lista de Metas (handoff 08a, #154): resumo do topo, abas,
// selo de ritmo e linha de apoio de cada card. Funções puras; `hoje` entra
// por parâmetro para o teste fixar a data.

// A partir de quantos meses sem aporte a linha de apoio avisa.
export const MESES_SEM_APORTE_PARA_AVISO = 2;

export const ABAS_DE_METAS = Object.freeze([
  { value: 'ativas', label: 'Ativas' },
  { value: 'concluidas', label: 'Concluídas' },
]);

const SELOS_DE_RITMO = {
  on_track: { rotulo: 'No ritmo', tom: 'verde' },
  attention: { rotulo: 'Atenção', tom: 'violeta' },
  late: { rotulo: 'Atrasada', tom: 'neutro' },
};

const FORMATO_MES = new Intl.DateTimeFormat('pt-BR', { month: 'long' });
const FORMATO_MES_ANO = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const FORMATO_DIA_MES_ANO = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

export function separarPorAba(metas) {
  const ativas = [];
  const concluidas = [];
  for (const meta of metas) {
    if (meta.status === 'active' || meta.status === 'paused') ativas.push(meta);
    else if (meta.status === 'completed') concluidas.push(meta);
  }
  return { ativas, concluidas };
}

// Topo da lista: só metas ativas. Pausada sai do cálculo.
export function resumirMetasAtivas(metas) {
  const ativas = metas.filter((meta) => meta.status === 'active');
  const guardado = ativas.reduce((soma, meta) => soma + Number(meta.current_amount || 0), 0);
  const total = ativas.reduce((soma, meta) => soma + Number(meta.target_amount || 0), 0);
  return {
    quantidade: ativas.length,
    guardado,
    total,
    progresso: calcProgress(guardado, total),
  };
}

export function seloDaMeta(meta) {
  if (meta.status === 'completed') return { rotulo: 'Concluída', tom: 'verde' };
  if (meta.status === 'paused') return { rotulo: 'Pausada', tom: 'neutro' };
  return SELOS_DE_RITMO[calcRhythmStatus(meta)] ?? null;
}

// Sem aporte registrado, conta desde o início da meta.
export function mesesSemAporte(meta, hoje = new Date()) {
  const referencia = meta.last_contribution_date || meta.start_date || meta.created_at;
  return referencia ? mesesEntre(referencia, hoje) : 0;
}

function textoDoAlvo(dataAlvo, hoje) {
  const alvo = lerData(dataAlvo);
  if (!alvo) return null;
  const formato = alvo.getFullYear() === hoje.getFullYear() ? FORMATO_MES : FORMATO_MES_ANO;
  return `alvo em ${formato.format(alvo)}`;
}

function juntar(...partes) {
  return partes.filter(Boolean).join(' · ');
}

export function linhaDeApoio(meta, hoje = new Date()) {
  if (meta.status === 'completed') {
    const concluidaEm = lerData(meta.completed_at);
    return concluidaEm ? `Concluída em ${FORMATO_DIA_MES_ANO.format(concluidaEm)}` : 'Concluída';
  }

  const falta = calcRemaining(Number(meta.current_amount || 0), Number(meta.target_amount || 0));
  if (falta <= 0) return 'Valor alcançado. Conclua a meta.';

  const alvo = textoDoAlvo(meta.target_date, hoje);

  if (meta.status === 'active') {
    const semAporte = mesesSemAporte(meta, hoje);
    if (semAporte >= MESES_SEM_APORTE_PARA_AVISO) return `Sem aporte há ${semAporte} meses`;

    const mensal = calcRequiredMonthlyAmount(meta);
    if (calcRhythmStatus(meta) === 'on_track' && mensal > 0) {
      return juntar(`${formatCurrency(Math.ceil(mensal))} por mês`, alvo);
    }
  }

  return juntar(`Faltam ${formatCurrency(falta)}`, alvo);
}
