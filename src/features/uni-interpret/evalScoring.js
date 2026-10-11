// Régua do conjunto de avaliação (épico #104). Não conhece nenhum
// interpretador: recebe o caso e um resultado já normalizado, para que as
// regras atuais e o uni-interpret sejam medidos exatamente do mesmo jeito.
//
// Resultado normalizado:
//   { intent, valor, data, categoria, modoCategoria, parcelas, recorrente, consulta }
// modoCategoria: 'resolveu' | 'sugeriu' | 'propos_criar' | 'perguntou'.
// consulta: { tipo, inicio, fim, categoria, termo }; ausente em quem não lê
// parâmetros de consulta (as regras atuais).

import { DATA_REFERENCIA } from './evalCases.js';
import { periodoDaConsulta } from './uniInterpretConsulta.js';
import { normalizeSearchText } from '../../utils/searchText.js';

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

// Fim no futuro vale qualquer fim a partir de hoje: não há movimentação
// concluída depois de hoje, então "esse ano" até hoje ou até 31/12 somam igual.
function mesmoPeriodo(esperado, obtido) {
  const periodoEsperado = periodoDaConsulta(esperado, DATA_REFERENCIA);
  const periodoObtido = periodoDaConsulta(obtido, DATA_REFERENCIA);
  if (periodoEsperado.inicio !== periodoObtido.inicio) return false;
  if (periodoEsperado.fim >= DATA_REFERENCIA) return periodoObtido.fim >= DATA_REFERENCIA;
  return periodoEsperado.fim === periodoObtido.fim;
}

// filtros: os jeitos aceitos de filtrar ({ categoria, termo }); ausente,
// a consulta não filtra nada. O termo vale com outras palavras em volta.
function mesmoFiltro(filtros = [{}], obtido) {
  return filtros.some((filtro) => (filtro.categoria ?? null) === obtido.categoria
    && (filtro.termo
      ? normalizeSearchText(obtido.termo).includes(normalizeSearchText(filtro.termo))
      : obtido.termo === null));
}

function avaliarConsulta(esperado, obtido) {
  if (!obtido || esperado.tipo !== obtido.tipo) return false;
  if (esperado.tipo === 'outra') return true;
  return mesmoPeriodo(esperado, obtido) && mesmoFiltro(esperado.filtros, obtido);
}

// Devolve um veredito por campo: true (acertou), false (errou) ou null
// (o campo não se aplica ao caso).
export function avaliarCaso(caso, resultado) {
  const { esperado } = caso;
  const intent = resultado.intent === esperado.intent;

  if (!INTENTS_DE_LANCAMENTO.has(esperado.intent)) {
    return {
      intent,
      valor: null,
      data: null,
      categoria: null,
      modalidade: null,
      consulta: esperado.consulta && resultado.consulta !== undefined
        ? intent && avaliarConsulta(esperado.consulta, resultado.consulta)
        : null,
    };
  }

  return {
    intent,
    valor: intent && mesmoValor(esperado.valor, resultado.valor),
    data: intent && resultado.data === (esperado.data ?? DATA_REFERENCIA),
    categoria: intent && avaliarCategoria(esperado, resultado),
    // Parcelamento e recorrência: por padrão, compra à vista e única. Pagar
    // "a parcela do IPTU" não pode virar parcelamento.
    modalidade: intent
      && (resultado.parcelas ?? null) === (esperado.parcelas ?? null)
      && (resultado.recorrente === true) === (esperado.recorrente === true),
    consulta: null,
  };
}

export function resumirAvaliacao(vereditos) {
  const campos = ['intent', 'valor', 'data', 'categoria', 'modalidade', 'consulta'];
  return Object.fromEntries(campos.map((campo) => {
    const aplicaveis = vereditos.filter((veredito) => veredito[campo] !== null);
    const acertos = aplicaveis.filter((veredito) => veredito[campo]).length;
    return [campo, { acertos, total: aplicaveis.length }];
  }));
}

const INTENT_DO_INTERPRETADOR = {
  saldo: 'saldo',
  meta: 'meta',
  consulta: 'consulta',
  agenda: 'agenda',
  conversa: 'conversa',
  correcao: 'correcao',
  nao_entendi: 'nao_entendeu',
};
const INTENT_POR_TIPO = { saida: 'lancar_saida', entrada: 'lancar_entrada', transferencia: 'transferir' };

// Converte a saída já validada do uni-interpret (validarInterpretacao) no
// resultado normalizado da régua. Categoria com confiança abaixo do limiar
// conta como sugestão: é o que o card mostra pedindo confirmação.
export function normalizarInterpretacao(validada, { limiarConfianca = 0.7 } = {}) {
  const operacao = validada.operacoes[0] ?? null;
  const intent = validada.intent === 'lancamento' && operacao
    ? INTENT_POR_TIPO[operacao.tipo]
    : INTENT_DO_INTERPRETADOR[validada.intent] ?? validada.intent;

  if (!operacao) {
    const consulta = validada.consulta
      ? {
        tipo: validada.consulta.tipo,
        inicio: validada.consulta.inicio,
        fim: validada.consulta.fim,
        categoria: validada.consulta.categoria?.name ?? null,
        termo: validada.consulta.termo,
      }
      : null;
    return {
      intent, valor: null, data: null, categoria: null, modoCategoria: 'perguntou', parcelas: null, recorrente: false, consulta,
    };
  }

  let modoCategoria = 'perguntou';
  if (operacao.categoria) {
    modoCategoria = operacao.confianca >= limiarConfianca ? 'resolveu' : 'sugeriu';
  } else if (operacao.novaCategoria) {
    modoCategoria = 'propos_criar';
  }

  return {
    intent,
    valor: operacao.valor,
    data: operacao.data,
    categoria: operacao.categoria?.name ?? operacao.novaCategoria ?? null,
    modoCategoria,
    parcelas: operacao.parcelas ?? null,
    recorrente: operacao.recorrente === true,
    consulta: null,
  };
}
