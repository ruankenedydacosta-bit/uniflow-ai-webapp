import { formatCurrency } from '../../utils/formatters.js';
import { numerosDaMeta } from './detalheDaMeta.js';

// Marco de meta (#147): o aporte que faz o valor guardado passar de 50% ou
// de 100% do alvo abre a tela de celebração. Funções puras, usadas pela
// folha de aporte do detalhe e reutilizáveis pelo aporte feito pela Uni.

export const MARCOS_DA_META = Object.freeze([50, 100]);

// Maior marco que o movimento cruzou: antes abaixo dele, depois nele ou
// acima. Compara em centavos, e não pelo percentual arredondado, para 49,6%
// não contar como 50% e a soma em ponto flutuante não perder o alvo exato.
// Retirada não celebra. `antes` é o maior valor que a meta já teve (ver
// maiorValorJaGuardado): voltar a um marco depois de uma retirada não
// repete a festa.
export function marcoCruzado({ antes, depois, alvo }) {
  const de = Math.round(Number(antes) * 100);
  const para = Math.round(Number(depois) * 100);
  const total = Number(alvo);
  if (!Number.isFinite(de) || !Number.isFinite(para) || !(total > 0) || para <= de) return null;
  const cruzados = MARCOS_DA_META.filter((marco) => {
    const limite = Math.round(total * marco);
    return de < limite && para >= limite;
  });
  return cruzados.length ? cruzados[cruzados.length - 1] : null;
}

// Maior valor guardado que a meta já teve, refazendo os aportes em ordem.
// O que não veio de aporte (valor inicial, edição do valor guardado) entra
// como ponto de partida. `aportes` vem do listContributions, do mais
// recente para o mais antigo.
export function maiorValorJaGuardado(meta, aportes = []) {
  const atual = Number(meta.current_amount || 0);
  const centavos = aportes.map((aporte) => Math.round(Number(aporte.amount || 0) * 100)).reverse();
  const somaDosAportes = centavos.reduce((soma, valor) => soma + valor, 0);
  let acumulado = Math.round(atual * 100) - somaDosAportes;
  let maior = acumulado;
  for (const valor of centavos) {
    acumulado += valor;
    maior = Math.max(maior, acumulado);
  }
  return maior / 100;
}

export function tomDoMarco(marco) {
  return marco === 100 ? 'verde' : 'violeta';
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
