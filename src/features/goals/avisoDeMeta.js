import { formatCurrency } from '../../utils/formatters.js';
import { calcExpectedProgress, calcProgress, calcRhythmStatus } from './goalCalc.js';
import { numerosDaMeta, precisaDeAjuste } from './detalheDaMeta.js';
import { lerData } from './listaDeMetas.js';

// Aviso de metas na Leitura do mês da Home (#162).
//
// Uma linha só, a da meta mais urgente: atrasada, depois em atenção, depois
// um marco (100% e 50%) alcançado neste mês. Meta pausada ou concluída não
// gera aviso, e com todas no ritmo não há linha.
//
// O ritmo é o mesmo do selo da lista e do detalhe (goalCalc), que olha o
// relógio do aparelho. `hoje` decide só o mês dos aportes que contam para o
// marco e o texto do prazo.
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

const FORMATO_DIA_MES = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' });

function plural(quantidade, singular, pluralForma) {
  return quantidade === 1 ? singular : pluralForma;
}

// Soma dos aportes e retiradas da meta a partir do 1º dia do mês de `hoje`.
function movimentoDoMes(meta, hoje) {
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  return (meta.aportes_do_periodo ?? []).reduce((soma, aporte) => {
    const data = lerData(aporte.contribution_date);
    return data && data >= inicio ? soma + Number(aporte.amount || 0) : soma;
  }, 0);
}

// Maior marco que a meta passou neste mês: o valor guardado no 1º dia (o de
// hoje menos os movimentos do mês) estava abaixo dele, e o de hoje não está.
// Compara valores, não o percentual arredondado: R$ 11.950 de R$ 12.000 não é
// 100%.
function marcoDoMes(meta, hoje) {
  const movimento = movimentoDoMes(meta, hoje);
  if (!movimento) return null;
  const alvo = Number(meta.target_amount || 0);
  if (!(alvo > 0)) return null;
  const agora = Number(meta.current_amount || 0);
  const antes = agora - movimento;
  return MARCOS_DA_META.find((marco) => {
    const limite = (alvo * marco) / 100;
    return antes < limite && agora >= limite;
  }) ?? null;
}

function detalheDoRitmo(meta, hoje) {
  const { falta, porMes, data: mesDoAlvo } = numerosDaMeta(meta);
  const alvo = lerData(meta.target_date);
  const textoDaFalta = formatCurrency(falta);
  if (!alvo) return `Faltam ${textoDaFalta}.`;
  // Mesmo critério do goalCalc para "prazo passou", senão o título diria
  // "atrasada" e o detalhe ainda daria valor por mês.
  if (new Date(meta.target_date) < new Date()) return `Faltam ${textoDaFalta}. O prazo era ${mesDoAlvo}.`;
  // Prazo neste mês: o valor por mês do goalCalc cai no planejado, que não
  // basta. O que falta tem de entrar até a data.
  if (alvo.getFullYear() === hoje.getFullYear() && alvo.getMonth() === hoje.getMonth()) {
    return `Faltam ${textoDaFalta} até ${FORMATO_DIA_MES.format(alvo)}.`;
  }
  if (porMes) return `Guarde ${formatCurrency(porMes)} por mês para chegar em ${mesDoAlvo}.`;
  return `Faltam ${textoDaFalta}.`;
}

function detalheDoMarco(meta, marco) {
  if (marco === 100) return 'Abra a meta e toque em Concluir meta.';
  const { falta } = numerosDaMeta(meta);
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
    .filter(precisaDeAjuste)
    .map((meta) => ({
      meta,
      ritmo: calcRhythmStatus(meta),
      // Quanto falta, em pontos de progresso, para o esperado nesta data.
      deficit: (calcExpectedProgress(meta) ?? 0)
        - calcProgress(Number(meta.current_amount || 0), Number(meta.target_amount || 0)),
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
    .map((meta) => ({ meta, marco: marcoDoMes(meta, hoje) }))
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
