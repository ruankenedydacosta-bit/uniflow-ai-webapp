import { formatCurrency } from '../../utils/formatters.js';
import { textoDoMes } from './criacaoDeMeta.js';
import { calcExpectedProgress, calcProgress, calcRemaining, calcRhythmStatus } from './goalCalc.js';
import { numerosDaMeta } from './detalheDaMeta.js';
import { lerData } from './listaDeMetas.js';

// Aviso de metas na Leitura do mês da Home (#162). Funções puras; `hoje`
// entra por parâmetro para o teste fixar a data.
//
// Uma linha só, a da meta mais urgente: atrasada, depois em atenção, depois
// um marco (100% e 50%) alcançado neste mês. Meta pausada ou concluída não
// gera aviso, e com todas no ritmo não há linha.
//
// O aviso é calculado a cada abertura da Home e fica fora da leitura escrita
// pela Uni: o cache do dia da Uni não esconde uma meta que acabou de atrasar.

export const TIPOS_DE_AVISO_DE_META = Object.freeze({
  ATRASADA: 'goal-late',
  ATENCAO: 'goal-attention',
  MARCO: 'goal-milestone',
});

export const MARCOS_DA_META = Object.freeze([100, 50]);

const PRIORIDADE_DO_RITMO = { late: 0, attention: 1 };

function plural(quantidade, singular, pluralForma) {
  return quantidade === 1 ? singular : pluralForma;
}

function inicioDoMes(hoje) {
  return new Date(hoje.getFullYear(), hoje.getMonth(), 1);
}

// Soma dos aportes e retiradas da meta a partir do 1º dia do mês.
function movimentoDoMes(meta, hoje) {
  const inicio = inicioDoMes(hoje);
  return (meta.aportes_do_periodo ?? []).reduce((soma, aporte) => {
    const data = lerData(aporte.contribution_date);
    return data && data >= inicio ? soma + Number(aporte.amount || 0) : soma;
  }, 0);
}

// Maior marco que a meta passou neste mês: o valor guardado no 1º dia (o de
// hoje menos os movimentos do mês) estava abaixo dele, e o de hoje não está.
function marcoDoMes(meta, movimentoDoMes) {
  if (!movimentoDoMes) return null;
  const alvo = Number(meta.target_amount || 0);
  const agora = calcProgress(Number(meta.current_amount || 0), alvo);
  const antes = calcProgress(Number(meta.current_amount || 0) - movimentoDoMes, alvo);
  return MARCOS_DA_META.find((marco) => antes < marco && agora >= marco) ?? null;
}

function detalheDoRitmo(meta, hoje) {
  const { falta, porMes } = numerosDaMeta(meta);
  const alvo = lerData(meta.target_date);
  const mesDoAlvo = alvo ? textoDoMes(alvo.getFullYear(), alvo.getMonth()) : null;
  const prazoPassou = alvo && alvo < new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  if (prazoPassou) return `Faltam ${formatCurrency(falta)}. O prazo era ${mesDoAlvo}.`;
  if (porMes && mesDoAlvo) return `Guarde ${formatCurrency(porMes)} por mês para chegar em ${mesDoAlvo}.`;
  return `Faltam ${formatCurrency(falta)}.`;
}

function detalheDoMarco(meta, marco) {
  if (marco === 100) return 'Abra a meta e toque em Concluir meta.';
  const falta = calcRemaining(Number(meta.current_amount || 0), Number(meta.target_amount || 0));
  return `Faltam ${formatCurrency(falta)} para chegar a ${formatCurrency(Number(meta.target_amount || 0))}.`;
}

function tituloDoMarco(meta, marco) {
  return marco === 100
    ? `Você juntou todo o valor da meta ${meta.name}.`
    : `Você já guardou metade da meta ${meta.name}.`;
}

/**
 * Aviso de meta para a Leitura do mês, ou null. `metas` vêm do listGoals com
 * `aportesDesde` no 1º dia do mês: cada uma traz `aportes_do_periodo`
 * ({ amount, contribution_date }), que diz se um marco foi passado agora.
 * Devolve { tipo, metaId, titulo, detalhe }.
 */
export function avisoDeMetaParaLeitura(metas = [], hoje = new Date()) {
  const ativas = metas.filter((meta) => meta.status === 'active' && !meta.archived_at);

  const foraDoRitmo = ativas
    .map((meta) => ({ meta, ritmo: calcRhythmStatus(meta) }))
    .filter(({ ritmo }) => ritmo in PRIORIDADE_DO_RITMO)
    .map((item) => ({
      ...item,
      // Quanto falta, em pontos de progresso, para o esperado nesta data.
      deficit: (calcExpectedProgress(item.meta) ?? 0)
        - calcProgress(Number(item.meta.current_amount || 0), Number(item.meta.target_amount || 0)),
    }))
    .sort((a, b) => (PRIORIDADE_DO_RITMO[a.ritmo] - PRIORIDADE_DO_RITMO[b.ritmo]) || (b.deficit - a.deficit));

  if (foraDoRitmo.length > 0) {
    const [{ meta, ritmo }] = foraDoRitmo;
    const outras = foraDoRitmo.length - 1;
    const detalhe = detalheDoRitmo(meta, hoje);
    return Object.freeze({
      tipo: ritmo === 'late' ? TIPOS_DE_AVISO_DE_META.ATRASADA : TIPOS_DE_AVISO_DE_META.ATENCAO,
      metaId: meta.id,
      titulo: ritmo === 'late'
        ? `A meta ${meta.name} está atrasada.`
        : `A meta ${meta.name} precisa de atenção.`,
      detalhe: outras > 0
        ? `${detalhe} ${outras} ${plural(outras, 'outra meta também está fora', 'outras metas também estão fora')} do ritmo.`
        : detalhe,
    });
  }

  const comMarco = ativas
    .map((meta) => ({ meta, marco: marcoDoMes(meta, movimentoDoMes(meta, hoje)) }))
    .filter(({ marco }) => marco !== null)
    .sort((a, b) => b.marco - a.marco);

  if (comMarco.length === 0) return null;
  const [{ meta, marco }] = comMarco;
  return Object.freeze({
    tipo: TIPOS_DE_AVISO_DE_META.MARCO,
    metaId: meta.id,
    titulo: tituloDoMarco(meta, marco),
    detalhe: detalheDoMarco(meta, marco),
  });
}

export function primeiroDiaDoMes(hoje = new Date()) {
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  return `${hoje.getFullYear()}-${mes}-01`;
}
