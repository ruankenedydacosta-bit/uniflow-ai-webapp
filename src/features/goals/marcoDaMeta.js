import { formatCurrency } from '../../utils/formatters.js';
import { numerosDaMeta } from './detalheDaMeta.js';

// Marco de meta (#147): o aporte que faz o valor guardado passar de 50% ou
// de 100% do alvo abre a tela de celebração. Funções puras, usadas pela
// folha de aporte do detalhe e reutilizáveis pelo aporte feito pela Uni.

export const MARCOS_DA_META = Object.freeze([50, 100]);

// Maior marco que o movimento cruzou: antes abaixo dele, depois nele ou
// acima. Compara os valores em reais, e não o percentual arredondado, para
// 49,6% não contar como 50%. Retirada não celebra, e reabrir a meta já
// acima do marco também não, porque nada cruzou.
export function marcoCruzado({ antes, depois, alvo }) {
  const de = Number(antes);
  const para = Number(depois);
  const total = Number(alvo);
  if (!Number.isFinite(de) || !Number.isFinite(para) || !(total > 0) || para <= de) return null;
  const cruzados = MARCOS_DA_META.filter((marco) => {
    const limite = (total * marco) / 100;
    return de < limite && para >= limite;
  });
  return cruzados.length ? cruzados[cruzados.length - 1] : null;
}

// Textos da tela de celebração. `meta` já vem com o valor guardado depois
// do aporte.
export function celebracaoDoMarco(meta, marco) {
  const { guardado, falta, data } = numerosDaMeta(meta);
  if (marco === 100) {
    return {
      marco,
      titulo: 'Meta alcançada',
      texto: `Você guardou ${formatCurrency(guardado)} para ${meta.name}. Toque em Concluir meta para movê-la para Concluídas.`,
    };
  }
  return {
    marco,
    titulo: `${marco}% da meta ${meta.name}`,
    texto: data
      ? `Você guardou ${formatCurrency(guardado)}. Faltam ${formatCurrency(falta)} até ${data}.`
      : `Você guardou ${formatCurrency(guardado)}. Faltam ${formatCurrency(falta)}.`,
  };
}
