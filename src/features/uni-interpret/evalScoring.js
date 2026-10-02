// Régua do conjunto de avaliação (épico #104). Não conhece nenhum
// interpretador: recebe o caso e um resultado já normalizado, para que as
// regras atuais e o uni-interpret sejam medidos exatamente do mesmo jeito.
//
// Resultado normalizado:
//   { intent, valor, data, categoria, modoCategoria }
// modoCategoria: 'resolveu' | 'sugeriu' | 'propos_criar' | 'perguntou'.

import { DATA_REFERENCIA } from './evalCases.js';

export const INTENTS_DE_LANCAMENTO = new Set(['lancar_saida', 'lancar_entrada', 'transferir']);

function mesmoValor(esperado, obtido) {
  return Number.isFinite(obtido) && Math.round(esperado * 100) === Math.round(obtido * 100);
}

function avaliarCategoria(esperado, resultado) {
  if (esperado.categoria === null) {
    return resultado.modoCategoria === 'perguntou';
  }
  if (resultado.modoCategoria !== 'resolveu' && resultado.modoCategoria !== 'sugeriu') {
    return false;
  }
  return [esperado.categoria, ...(esperado.aceitas ?? [])].includes(resultado.categoria);
}

// Devolve um veredito por campo: true (acertou), false (errou) ou null
// (o campo não se aplica ao caso).
export function avaliarCaso(caso, resultado) {
  const { esperado } = caso;
  const intent = resultado.intent === esperado.intent;

  if (!INTENTS_DE_LANCAMENTO.has(esperado.intent)) {
    return { intent, valor: null, data: null, categoria: null };
  }

  return {
    intent,
    valor: intent && mesmoValor(esperado.valor, resultado.valor),
    data: intent && resultado.data === (esperado.data ?? DATA_REFERENCIA),
    categoria: intent && avaliarCategoria(esperado, resultado),
  };
}

export function resumirAvaliacao(vereditos) {
  const campos = ['intent', 'valor', 'data', 'categoria'];
  return Object.fromEntries(campos.map((campo) => {
    const aplicaveis = vereditos.filter((veredito) => veredito[campo] !== null);
    const acertos = aplicaveis.filter((veredito) => veredito[campo]).length;
    return [campo, { acertos, total: aplicaveis.length }];
  }));
}
