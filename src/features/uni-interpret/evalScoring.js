// Régua do conjunto de avaliação (épico #104). Não conhece nenhum
// interpretador: recebe o caso e um resultado já normalizado, para que as
// regras atuais e o uni-interpret sejam medidos exatamente do mesmo jeito.
//
// Resultado normalizado:
//   { intent, valor, data, categoria, modoCategoria, parcelas, recorrente, titulo, consulta }
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
  if (esperado.novaCategoria) {
    return resultado.modoCategoria === 'propos_criar'
      && normalizeSearchText(resultado.categoria ?? '') === normalizeSearchText(esperado.novaCategoria);
  }
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
  // outra vai para as regras e categorias não tem filtro: basta o tipo.
  if (esperado.tipo === 'outra' || esperado.tipo === 'categorias') return true;
  return mesmoPeriodo(esperado, obtido) && mesmoFiltro(esperado.filtros, obtido);
}

// Sobra do pedido que não pode ir para a agenda (#142): "meu que eu vou ter
// que pagar..." foi o título real que motivou o campo.
const RESTO_DE_PEDIDO = /\b(?:lembr\w*|anota\w*|uni|que eu|vou ter|amanha|reais)\b/;

// Título de agenda: começa com maiúscula, tem as palavras esperadas e nada
// do pedido.
function avaliarTitulo(palavras, titulo) {
  if (typeof titulo !== 'string' || !titulo) return false;
  const normalizado = normalizeSearchText(titulo);
  return titulo[0] === titulo[0].toUpperCase()
    && palavras.every((palavra) => normalizado.includes(normalizeSearchText(palavra)))
    && !RESTO_DE_PEDIDO.test(normalizado);
}

// Pedido de categoria, de agenda, de exclusão ou de meta: a ação certa e,
// quando o caso diz, o nome, o alvo e a conta (#161), sem acento e caixa. Alvo em lista
// (#191) ou `palavras` (#189) são as palavras que o texto precisa ter: o
// modelo chama o item como a pessoa chamou, não como está salvo. Valor
// compara em centavos; data, ultimo, lote e soNaMeta batem exatos.
function avaliarPedido(esperado, obtido) {
  if (!obtido || obtido.acao !== esperado.acao) return false;
  const textoIgual = ['nome', 'alvo', 'conta'].every((campo) => {
    if (esperado[campo] === undefined) return true;
    const texto = normalizeSearchText(obtido[campo] ?? '');
    if (Array.isArray(esperado[campo])) {
      return esperado[campo].every((palavra) => texto.includes(normalizeSearchText(palavra)));
    }
    return texto === normalizeSearchText(esperado[campo]);
  });
  const palavras = esperado.palavras === undefined
    || esperado.palavras.every((palavra) => normalizeSearchText(obtido.alvo ?? '').includes(normalizeSearchText(palavra)));
  const valor = esperado.valor === undefined
    || (esperado.valor === null ? (obtido.valor ?? null) === null : mesmoValor(esperado.valor, obtido.valor));
  const exatos = ['data', 'ultimo', 'lote', 'soNaMeta'].every((campo) => esperado[campo] === undefined
    || (obtido[campo] ?? null) === esperado[campo]);
  return textoIgual && palavras && valor && exatos;
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
      // Quem não produz título (as regras atuais na régua) não é medido nele.
      titulo: esperado.titulo && resultado.titulo !== undefined
        ? intent && avaliarTitulo(esperado.titulo, resultado.titulo)
        : null,
      consulta: esperado.consulta && resultado.consulta !== undefined
        ? intent && avaliarConsulta(esperado.consulta, resultado.consulta)
        : null,
      pedido: esperado.pedido && resultado.pedido !== undefined
        ? intent && avaliarPedido(esperado.pedido, resultado.pedido)
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
    titulo: null,
    consulta: null,
    pedido: null,
  };
}

export function resumirAvaliacao(vereditos) {
  const campos = ['intent', 'valor', 'data', 'categoria', 'modalidade', 'titulo', 'consulta', 'pedido'];
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
  categoria: 'categoria',
  exclusao: 'exclusao',
  conversa: 'conversa',
  correcao: 'correcao',
  nao_entendi: 'nao_entendeu',
};
const INTENT_POR_TIPO = { saida: 'lancar_saida', entrada: 'lancar_entrada', transferencia: 'transferir' };

// Pedido de categoria, meta, exclusão ou agenda no formato que avaliarPedido lê.
function pedidoDaInterpretacao(validada) {
  if (validada.categoria) {
    return { acao: validada.categoria.acao, nome: validada.categoria.nome, alvo: validada.categoria.alvo?.name ?? null };
  }
  if (validada.meta) {
    const { acao, nome, alvo, valor, data, conta, soNaMeta } = validada.meta;
    return { acao, nome, alvo: alvo?.name ?? null, valor, data, conta: conta?.name ?? null, soNaMeta };
  }
  if (validada.exclusao) {
    const { alvo, data, valor, conta, ultimo, lote } = validada.exclusao;
    return { acao: 'excluir_lancamento', alvo, data, valor, conta: conta?.name ?? null, ultimo, lote };
  }
  // Criar segue a régua do título; o pedido é só sobre item existente (#191).
  if (validada.agenda?.acao && validada.agenda.acao !== 'criar') {
    return { acao: validada.agenda.acao, nome: validada.agenda.titulo, alvo: validada.agenda.alvo };
  }
  return null;
}

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
      intent,
      valor: null,
      data: null,
      categoria: null,
      modoCategoria: 'perguntou',
      parcelas: null,
      recorrente: false,
      titulo: validada.agenda?.titulo ?? null,
      consulta,
      pedido: pedidoDaInterpretacao(validada),
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
    titulo: null,
    consulta: null,
    pedido: null,
  };
}
