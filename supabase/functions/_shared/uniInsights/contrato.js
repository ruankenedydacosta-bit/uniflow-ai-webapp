// Leitura do mês escrita pela Uni (#122): o que a Edge Function uni-insights
// aceita do app e o que exige do modelo. JS puro: o index.ts (Deno) e os
// testes (node --test) importam o mesmo arquivo.
//
// O app manda só números agregados por categoria (buildHomeMonthFacts), nunca
// a descrição dos lançamentos. Nome de categoria é texto da pessoa e vai ao
// modelo como dado, limitado em tamanho.

export const LIMITE_DIARIO = 10;
export const MAX_LEITURAS = 3;
export const MAX_CATEGORIAS = 60;
export const MAX_NOME = 60;
export const MAX_ROTULO = 40;
export const MAX_TITULO = 140;
export const MAX_DETALHE = 160;
// Mesmo teto de numeric(14, 2).
const MAX_VALOR = 999_999_999_999.99;

export const TIPOS = Object.freeze(['alerta', 'atencao', 'elogio', 'informacao']);
export const ORIGENS_ORCAMENTO = Object.freeze(['teto', 'media']);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function texto(valor, max) {
  if (typeof valor !== 'string') return '';
  // eslint-disable-next-line no-control-regex -- remove caractere de controle vindo do cliente
  return valor.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

function valor(numero) {
  const convertido = Number(numero);
  if (!Number.isFinite(convertido) || convertido < 0 || convertido > MAX_VALOR) return null;
  return Math.round(convertido * 100) / 100;
}

function inteiro(numero, minimo, maximo) {
  const convertido = Number(numero);
  return Number.isInteger(convertido) && convertido >= minimo && convertido <= maximo ? convertido : null;
}

/**
 * Lê e limpa o corpo do pedido. Devolve { ok: true, fatos } ou
 * { ok: false }. Categoria com número inválido é descartada; sem nenhuma
 * categoria válida, o pedido é recusado.
 */
export function lerPedido(corpo) {
  const registro = corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {};
  const fatos = registro.fatos && typeof registro.fatos === 'object' ? registro.fatos : {};
  const periodo = fatos.periodo && typeof fatos.periodo === 'object' ? fatos.periodo : {};

  const periodoLimpo = {
    mesAtual: texto(periodo.mesAtual, MAX_ROTULO),
    mesAnterior: texto(periodo.mesAnterior, MAX_ROTULO),
    rotuloAtual: texto(periodo.rotuloAtual, MAX_ROTULO),
    rotuloAnterior: texto(periodo.rotuloAnterior, MAX_ROTULO),
    dia: inteiro(periodo.dia, 1, 31),
    diasNoMes: inteiro(periodo.diasNoMes, 28, 31),
  };
  const saidasDoMes = valor(fatos.saidasDoMes);

  const ids = new Set();
  const categorias = (Array.isArray(fatos.categorias) ? fatos.categorias : [])
    .slice(0, MAX_CATEGORIAS)
    .map((categoria) => {
      const id = typeof categoria?.id === 'string' && UUID.test(categoria.id) ? categoria.id : null;
      const nome = texto(categoria?.nome, MAX_NOME);
      const gasto = valor(categoria?.gasto);
      const gastoAnterior = valor(categoria?.gastoAnterior);
      const media = valor(categoria?.media);
      let orcamento = null;
      if (categoria?.orcamento) {
        const valorOrcamento = valor(categoria.orcamento.valor);
        const origem = ORIGENS_ORCAMENTO.includes(categoria.orcamento.origem) ? categoria.orcamento.origem : null;
        if (valorOrcamento && origem) orcamento = { valor: valorOrcamento, origem };
      }
      if (!id || ids.has(id) || !nome || gasto === null || gastoAnterior === null || media === null) return null;
      ids.add(id);
      return { id, nome, gasto, gastoAnterior, media, orcamento };
    })
    .filter(Boolean);

  const periodoValido = Object.values(periodoLimpo).every((campo) => campo !== '' && campo !== null);
  if (!periodoValido || saidasDoMes === null || categorias.length === 0) return { ok: false };
  return { ok: true, fatos: { periodo: periodoLimpo, saidasDoMes, categorias } };
}

// Saída exigida do modelo (structured output). Limites de tamanho e de
// quantidade são conferidos em validacao.js, não no esquema.
export const ESQUEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['leituras'],
  properties: {
    leituras: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tipo', 'categoriaId', 'titulo', 'detalhe'],
        properties: {
          tipo: { type: 'string', enum: [...TIPOS] },
          categoriaId: { type: 'string' },
          titulo: { type: 'string' },
          detalhe: { type: 'string' },
        },
      },
    },
  },
});
