// Contrato do uni-interpret (épico #104, F1): o schema que o modelo é
// obrigado a seguir e a validação de domínio que roda depois dele.
//
// JS puro, sem dependência: a Edge Function (Deno) e os testes/avaliação
// (node --test) importam o mesmo arquivo.
//
// O schema é fixo para todo mundo. Os provedores compilam cada schema novo na
// primeira chamada; com os ids de cada usuário dentro dele, toda pessoa (e
// toda categoria nova) pagaria essa latência na voz. Por isso categorias e
// contas vão no prompt com apelidos curtos (c1, c2, k1...) e a validação
// traduz o apelido para o registro real, descartando apelido inventado.

// saldo não leva operação: o app público não ajusta saldo pela conversa, só
// responde (#80). meta leva o pedido de meta (#192).
export const INTENTS = Object.freeze([
  'lancamento', 'saldo', 'meta', 'consulta', 'agenda', 'correcao', 'categoria', 'exclusao', 'edicao', 'conversa', 'nao_entendi',
]);
export const TIPOS = Object.freeze(['saida', 'entrada', 'transferencia']);
// Consulta que o app responde com os parâmetros (#80). 'lancamentos' lista
// os itens em vez de somar e 'categorias' lista o catálogo (#190). 'outra'
// (meta, contas a pagar, maior gasto, comparação...) segue para as regras de
// consulta.
export const TIPOS_CONSULTA = Object.freeze(['saidas', 'entradas', 'resumo', 'lancamentos', 'categorias', 'outra']);
// Criar, renomear ou excluir uma categoria pela conversa. O app confere
// permissão, nome repetido e categoria padrão antes de mostrar o card.
export const ACOES_CATEGORIA = Object.freeze(['criar', 'renomear', 'excluir']);
// Pedido de meta pela conversa (#192). Aportar e retirar (#161) registram
// dinheiro guardado ou tirado de uma meta, com as regras da #158.
export const ACOES_META = Object.freeze(['criar', 'editar', 'excluir', 'consultar', 'aportar', 'retirar']);
// O que fazer com um compromisso (#191). Cancelar muda o status; excluir
// apaga. Fora de criar, o app localiza o compromisso pelo alvo.
export const ACOES_AGENDA = Object.freeze(['criar', 'editar', 'cancelar', 'concluir', 'excluir', 'consultar']);

// Tipo da operação → category_type da tabela categories.
export const CATEGORY_TYPE_POR_TIPO = Object.freeze({
  saida: 'expense',
  entrada: 'income',
  transferencia: 'transfer',
});

export const MAX_OPERACOES = 6;
export const MAX_ALTERNATIVAS = 2;
export const MAX_DESCRICAO = 80;
export const MAX_NOVA_CATEGORIA = 40;
export const MAX_RESPOSTA = 240;
export const MAX_TITULO_AGENDA = 80;
// Parcelamento: de 2 a 72 parcelas. Fora disso é erro de leitura e vira
// compra à vista.
export const MIN_PARCELAS = 2;
export const MAX_PARCELAS = 72;
// Recorrência (#222): de quanto em quanto tempo o lançamento se repete.
// "Quinzenal" é semanal com intervalo 2. O teto do intervalo é o da RPC
// criar_serie_recorrente.
export const FREQUENCIAS = Object.freeze(['diaria', 'semanal', 'mensal', 'anual']);
export const MAX_INTERVALO = 365;
export const MAX_TERMO = 40;
export const MAX_NOME_META = 60;
// Prazo de meta: até dez anos. Mais que isso é erro de leitura.
export const MAX_DIAS_PRAZO_META = 3653;
// Aporte e retirada: até um ano para trás, nunca no futuro.
export const MAX_DIAS_MOVIMENTO_META = 366;
// Como a pessoa descreveu o lançamento que quer excluir (#189).
export const MAX_ALVO_EXCLUSAO = 80;

// Apelidos estáveis: ordem por tipo e nome, a mesma que o prompt mostra.
export function indexarCatalogo({ categorias = [], contas = [], metas = [] } = {}) {
  const categoriasOrdenadas = [...categorias].sort((a, b) =>
    a.category_type.localeCompare(b.category_type) || a.name.localeCompare(b.name, 'pt-BR'));
  const contasOrdenadas = [...contas].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const metasOrdenadas = [...metas].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return {
    categorias: categoriasOrdenadas.map((registro, indice) => ({ apelido: `c${indice + 1}`, registro })),
    contas: contasOrdenadas.map((registro, indice) => ({ apelido: `k${indice + 1}`, registro })),
    metas: metasOrdenadas.map((registro, indice) => ({ apelido: `m${indice + 1}`, registro })),
  };
}

const TEXTO_OU_NULO = { type: ['string', 'null'] };

const ESQUEMA_OPERACAO = {
  type: 'object',
  additionalProperties: false,
  required: [
    'tipo', 'valor', 'data', 'descricao', 'categoria', 'nova_categoria',
    'alternativas', 'conta', 'conta_destino', 'confianca', 'parcelas', 'recorrente',
    'frequencia', 'intervalo',
  ],
  properties: {
    tipo: { type: 'string', enum: [...TIPOS] },
    valor: { type: ['number', 'null'] },
    data: { ...TEXTO_OU_NULO, description: 'AAAA-MM-DD' },
    descricao: { type: 'string' },
    categoria: { ...TEXTO_OU_NULO, description: 'apelido do catálogo, ex.: c3' },
    nova_categoria: TEXTO_OU_NULO,
    alternativas: { type: 'array', items: { type: 'string' } },
    conta: { ...TEXTO_OU_NULO, description: 'apelido da conta, ex.: k1' },
    conta_destino: TEXTO_OU_NULO,
    confianca: { type: 'number' },
    parcelas: { type: ['integer', 'null'], description: 'número de parcelas da compra parcelada' },
    recorrente: { type: 'boolean' },
    frequencia: { type: ['string', 'null'], enum: [...FREQUENCIAS, null] },
    intervalo: { type: ['integer', 'null'], description: 'repete a cada quantas frequências; 1 se não diz' },
  },
};

// Pergunta sobre os dados (#80). Fora de consulta, todos os campos são null.
const ESQUEMA_CONSULTA = {
  type: 'object',
  additionalProperties: false,
  required: ['tipo', 'inicio', 'fim', 'categoria', 'conta', 'termo'],
  properties: {
    tipo: { type: ['string', 'null'], enum: [...TIPOS_CONSULTA, null] },
    inicio: { ...TEXTO_OU_NULO, description: 'AAAA-MM-DD' },
    fim: { ...TEXTO_OU_NULO, description: 'AAAA-MM-DD' },
    categoria: { ...TEXTO_OU_NULO, description: 'apelido do catálogo, ex.: c3' },
    conta: { ...TEXTO_OU_NULO, description: 'apelido da conta, ex.: k1' },
    termo: TEXTO_OU_NULO,
  },
};

// Compromisso ou lembrete (#142). Data e hora continuam com o parser da
// agenda no app; o modelo devolve o que a regex não consegue: o título como a
// pessoa escreveria e o valor citado. Em #191, também a ação sobre um
// compromisso que já existe e como a pessoa o chamou.
const ESQUEMA_AGENDA = {
  type: 'object',
  additionalProperties: false,
  required: ['acao', 'alvo', 'titulo', 'valor'],
  properties: {
    acao: { type: ['string', 'null'], enum: [...ACOES_AGENDA, null] },
    alvo: { ...TEXTO_OU_NULO, description: 'compromisso já marcado que muda, sai, foi feito ou é consultado, como a pessoa o chamou' },
    titulo: TEXTO_OU_NULO,
    valor: { type: ['number', 'null'] },
  },
};

// Pedido de categoria. Fora do intent categoria, todos os campos são null.
const ESQUEMA_CATEGORIA = {
  type: 'object',
  additionalProperties: false,
  required: ['acao', 'tipo', 'alvo', 'nome'],
  properties: {
    acao: { type: ['string', 'null'], enum: [...ACOES_CATEGORIA, null] },
    tipo: { type: ['string', 'null'], enum: ['saida', 'entrada', null] },
    alvo: { ...TEXTO_OU_NULO, description: 'apelido da categoria que muda ou sai, ex.: c3' },
    nome: { ...TEXTO_OU_NULO, description: 'nome da categoria nova ou nome novo' },
  },
};

// Pedido de meta (#192). Fora do intent meta, todos os campos são null.
const ESQUEMA_META = {
  type: 'object',
  additionalProperties: false,
  required: ['acao', 'alvo', 'nome', 'valor', 'data', 'por_mes', 'conta', 'so_na_meta'],
  properties: {
    acao: { type: ['string', 'null'], enum: [...ACOES_META, null] },
    alvo: { ...TEXTO_OU_NULO, description: 'apelido da meta que muda, sai, é consultada ou recebe o aporte, ex.: m2' },
    nome: { ...TEXTO_OU_NULO, description: 'nome da meta nova ou nome novo' },
    valor: { type: ['number', 'null'], description: 'quanto a pessoa quer juntar, ou quanto guardou ou tirou, em reais' },
    data: { ...TEXTO_OU_NULO, description: 'prazo, ou o dia do aporte ou da retirada, AAAA-MM-DD' },
    por_mes: { type: ['number', 'null'], description: 'quanto guardar por mês, em reais' },
    conta: { ...TEXTO_OU_NULO, description: 'apelido da conta de onde saiu ou para onde foi o dinheiro, ex.: k1' },
    so_na_meta: { type: 'boolean', description: 'a pessoa pediu para não lançar no Financeiro' },
  },
};

// Excluir um lançamento já registrado (#189). O modelo só diz qual: quem acha
// o lançamento, lista os parecidos e pede confirmação é o app. Fora do intent
// exclusao, todos os campos são null ou false.
const ESQUEMA_EXCLUSAO = {
  type: 'object',
  additionalProperties: false,
  required: ['alvo', 'data', 'valor', 'conta', 'ultimo', 'lote'],
  properties: {
    alvo: { ...TEXTO_OU_NULO, description: 'o que é o lançamento, sem data, valor nem conta, ex.: Uber' },
    data: { ...TEXTO_OU_NULO, description: 'AAAA-MM-DD' },
    valor: { type: ['number', 'null'] },
    conta: { ...TEXTO_OU_NULO, description: 'apelido da conta, ex.: k1' },
    ultimo: { type: 'boolean', description: 'a pessoa se refere ao último lançamento que fez' },
    lote: { type: 'boolean', description: 'a pessoa quer excluir vários lançamentos de uma vez' },
  },
};

// Alterar um lançamento já registrado (#261). Os critérios da busca são os da
// exclusão; os campos novo_* e nova_* dizem o que muda. Fora do intent edicao,
// todos são null ou false.
const ESQUEMA_EDICAO = {
  type: 'object',
  additionalProperties: false,
  required: ['alvo', 'data', 'valor', 'conta', 'ultimo', 'novo_valor', 'nova_data', 'nova_conta', 'nova_categoria', 'nova_descricao'],
  properties: {
    alvo: { ...TEXTO_OU_NULO, description: 'o que é o lançamento, sem data, valor nem conta, ex.: mercado' },
    data: { ...TEXTO_OU_NULO, description: 'dia do lançamento, AAAA-MM-DD' },
    valor: { type: ['number', 'null'], description: 'valor atual do lançamento, em reais' },
    conta: { ...TEXTO_OU_NULO, description: 'apelido da conta atual, ex.: k1' },
    ultimo: { type: 'boolean', description: 'a pessoa se refere ao último lançamento que fez' },
    novo_valor: { type: ['number', 'null'], description: 'valor certo, em reais' },
    nova_data: { ...TEXTO_OU_NULO, description: 'dia certo, AAAA-MM-DD' },
    nova_conta: { ...TEXTO_OU_NULO, description: 'apelido da conta certa, ex.: k2' },
    nova_categoria: { ...TEXTO_OU_NULO, description: 'apelido da categoria certa, ex.: c3' },
    nova_descricao: TEXTO_OU_NULO,
  },
};

// Schema estrito: todo campo é obrigatório e ausência vira null, que é o que
// o modo strict dos provedores aceita.
export const ESQUEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'operacoes', 'agenda', 'resposta', 'consulta', 'categoria', 'meta', 'exclusao', 'edicao'],
  properties: {
    intent: { type: 'string', enum: [...INTENTS] },
    operacoes: { type: 'array', items: ESQUEMA_OPERACAO },
    agenda: ESQUEMA_AGENDA,
    resposta: { type: 'string' },
    consulta: ESQUEMA_CONSULTA,
    categoria: ESQUEMA_CATEGORIA,
    meta: ESQUEMA_META,
    exclusao: ESQUEMA_EXCLUSAO,
    edicao: ESQUEMA_EDICAO,
  },
});

function textoLimpo(valor, max) {
  if (typeof valor !== 'string') return '';
  // eslint-disable-next-line no-control-regex -- remove caractere de controle vindo do modelo
  return valor.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

function dataValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(`${valor}T12:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

// Datas a mais de um ano da referência quase sempre são erro de leitura
// ("dia 5" virando 2025): cai para a referência e marca para o card mostrar.
function distanciaEmDias(isoA, isoB) {
  return Math.abs(new Date(`${isoA}T12:00:00Z`) - new Date(`${isoB}T12:00:00Z`)) / 86_400_000;
}

function validarOperacao(bruta, { categoriasPorApelido, contasPorApelido, dataReferencia }) {
  const tipo = TIPOS.includes(bruta?.tipo) ? bruta.tipo : null;
  if (!tipo) return null;

  const categoryType = CATEGORY_TYPE_POR_TIPO[tipo];
  const ajustes = [];

  const valorBruto = Number(bruta.valor);
  const valor = Number.isFinite(valorBruto) && valorBruto > 0 ? Math.round(valorBruto * 100) / 100 : null;

  let data = dataReferencia;
  if (bruta.data !== null && bruta.data !== undefined) {
    if (dataValida(bruta.data) && distanciaEmDias(bruta.data, dataReferencia) <= 366) {
      data = bruta.data;
    } else {
      ajustes.push('data_descartada');
    }
  }

  const categoriaDoTipo = (apelido) => {
    const categoria = categoriasPorApelido.get(apelido);
    return categoria && categoria.category_type === categoryType ? categoria : null;
  };

  const categoria = bruta.categoria ? categoriaDoTipo(bruta.categoria) : null;
  if (bruta.categoria && !categoria) ajustes.push('categoria_descartada');

  const novaCategoria = categoria ? null : (textoLimpo(bruta.nova_categoria, MAX_NOVA_CATEGORIA) || null);

  const alternativas = [];
  for (const apelido of Array.isArray(bruta.alternativas) ? bruta.alternativas : []) {
    const alternativa = categoriaDoTipo(apelido);
    if (alternativa && alternativa.id !== categoria?.id && !alternativas.includes(alternativa)) {
      alternativas.push(alternativa);
    }
    if (alternativas.length === MAX_ALTERNATIVAS) break;
  }

  const conta = contasPorApelido.get(bruta.conta) ?? null;
  let contaDestino = tipo === 'transferencia' ? contasPorApelido.get(bruta.conta_destino) ?? null : null;
  if (contaDestino && contaDestino === conta) {
    contaDestino = null;
    ajustes.push('conta_destino_igual');
  }

  // Parcela e recorrência não valem em transferência; parcela só em saída.
  const parcelasBrutas = Number(bruta.parcelas);
  const parcelas = tipo === 'saida' && Number.isInteger(parcelasBrutas)
    && parcelasBrutas >= MIN_PARCELAS && parcelasBrutas <= MAX_PARCELAS
    ? parcelasBrutas
    : null;
  const recorrente = tipo !== 'transferencia' && !parcelas && bruta.recorrente === true;
  // Sem frequência, a recorrência fica só com o rótulo: o app registra este
  // lançamento e orienta a criar a série no Financeiro.
  const frequencia = recorrente && FREQUENCIAS.includes(bruta.frequencia) ? bruta.frequencia : null;
  const intervaloBruto = Number(bruta.intervalo);
  const intervalo = frequencia
    ? (Number.isInteger(intervaloBruto) && intervaloBruto >= 1 && intervaloBruto <= MAX_INTERVALO ? intervaloBruto : 1)
    : null;

  const confiancaBruta = Number(bruta.confianca);
  const confianca = Number.isFinite(confiancaBruta) ? Math.min(1, Math.max(0, confiancaBruta)) : 0;

  const faltando = [];
  if (valor === null) faltando.push('valor');
  if (!categoria && !novaCategoria && tipo !== 'transferencia') faltando.push('categoria');
  if (tipo === 'transferencia' && (!conta || !contaDestino)) faltando.push('conta');

  return {
    tipo,
    valor,
    data,
    descricao: textoLimpo(bruta.descricao, MAX_DESCRICAO),
    categoria,
    novaCategoria,
    alternativas,
    conta,
    contaDestino,
    confianca,
    parcelas,
    recorrente,
    frequencia,
    intervalo,
    faltando,
    ajustes,
  };
}

const CATEGORY_TYPE_POR_TIPO_CONSULTA = Object.freeze({ saidas: 'expense', entradas: 'income' });
// Mais que isso é histórico inteiro: as regras respondem sem baixar anos de
// movimentações para uma soma.
export const MAX_DIAS_CONSULTA = 731;

// Período da consulta. Os dois null valem o mês atual; "desde agosto" chega
// sem fim e vai até hoje. Qualquer outro período que não dá para respeitar
// (só o fim, data impossível, invertido, futuro, longo demais) devolve o
// motivo, e a consulta vai para as regras em vez de responder outro período.
function validarPeriodo(bruta, dataReferencia) {
  const temInicio = bruta?.inicio !== null && bruta?.inicio !== undefined;
  const temFim = bruta?.fim !== null && bruta?.fim !== undefined;
  if (!temInicio && !temFim) return { inicio: null, fim: null, problema: null };

  const inicio = dataValida(bruta.inicio) ? bruta.inicio : null;
  const fim = temFim ? (dataValida(bruta.fim) ? bruta.fim : null) : (inicio ? dataReferencia : null);
  if (!inicio || !fim || inicio > fim) return { inicio: inicio ?? null, fim: fim ?? null, problema: 'periodo_invalido' };
  if (inicio > dataReferencia) return { inicio, fim, problema: 'periodo_futuro' };
  if (distanciaEmDias(inicio, fim) > MAX_DIAS_CONSULTA) return { inicio, fim, problema: 'periodo_longo' };
  return { inicio, fim, problema: null };
}

// Sem tipo, a consulta vira 'outra' e o app cai nas regras. Filtro que o app
// não consegue aplicar também: responder o total sem ele pareceria a resposta
// da pergunta.
function validarConsulta(bruta, { categoriasPorApelido, contasPorApelido, dataReferencia }) {
  const ajustes = [];
  let tipo = TIPOS_CONSULTA.includes(bruta?.tipo) ? bruta.tipo : 'outra';

  // O catálogo não tem período nem filtro: o que vier junto é ignorado.
  if (tipo === 'categorias') {
    return { tipo, inicio: null, fim: null, categoria: null, conta: null, termo: null, ajustes: [] };
  }

  const { inicio, fim, problema } = validarPeriodo(bruta, dataReferencia);
  if (problema) ajustes.push(problema);

  // Categoria de outro tipo ("quanto gastei de salário") ou apelido inventado.
  // A lista de lançamentos aceita categoria de qualquer tipo: ela não soma.
  const categoriaBruta = categoriasPorApelido.get(bruta?.categoria) ?? null;
  const categoryType = CATEGORY_TYPE_POR_TIPO_CONSULTA[tipo];
  const tipoCompativel = tipo === 'lancamentos' || (categoryType && categoriaBruta?.category_type === categoryType);
  const categoria = categoriaBruta && tipoCompativel ? categoriaBruta : null;
  if (bruta?.categoria && !categoria) ajustes.push('categoria_descartada');

  const conta = contasPorApelido.get(bruta?.conta) ?? null;
  if (bruta?.conta && !conta) ajustes.push('conta_descartada');

  const termo = textoLimpo(bruta?.termo, MAX_TERMO) || null;
  // O resumo soma tudo do período: não filtra por categoria nem por termo.
  if (tipo === 'resumo' && termo) ajustes.push('termo_no_resumo');

  if (ajustes.length > 0) tipo = 'outra';

  return { tipo, inicio, fim, categoria, conta, termo, ajustes };
}

// Texto vazio vira null; longo demais é cortado na última palavra inteira.
function tituloDeAgenda(valor) {
  const limpo = textoLimpo(valor, MAX_TITULO_AGENDA + 1);
  const titulo = limpo.length > MAX_TITULO_AGENDA
    ? limpo.slice(0, MAX_TITULO_AGENDA).replace(/\s+\S*$/, '')
    : limpo;
  return titulo || null;
}

export function semAcentoNemCaixa(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Título vazio vira null: o fluxo da agenda usa o parser próprio ou pergunta.
// Ação fora da lista vira null, e o app segue como antes do campo existir.
// Alvo só vale sobre um compromisso que já existe; em criar, é null. Título
// só vale em criar e, em editar, como nome novo: igual ao alvo é eco do
// modelo, e renomearia o compromisso numa remarcação.
function validarAgenda(bruta) {
  const acao = ACOES_AGENDA.includes(bruta?.acao) ? bruta.acao : null;
  const alvo = acao && acao !== 'criar' ? tituloDeAgenda(bruta?.alvo) : null;
  let titulo = tituloDeAgenda(bruta?.titulo);
  if (acao && acao !== 'criar' && acao !== 'editar') titulo = null;
  if (acao === 'editar' && titulo && alvo && semAcentoNemCaixa(titulo) === semAcentoNemCaixa(alvo)) titulo = null;
  const valorBruto = Number(bruta?.valor);
  const valor = Number.isFinite(valorBruto) ? Math.round(valorBruto * 100) / 100 : 0;
  return { acao, alvo, titulo, valor: valor > 0 ? valor : null };
}

// Apelido inventado vira alvo null, e o app diz que não achou a categoria.
// Renomear e excluir valem só para entrada e saída, com o tipo da própria
// categoria; criar sem tipo vale saída, o caso de quase toda categoria nova.
function validarCategoria(bruta, { categoriasPorApelido }) {
  const acao = ACOES_CATEGORIA.includes(bruta?.acao) ? bruta.acao : null;
  const alvo = acao && acao !== 'criar' ? categoriasPorApelido.get(bruta?.alvo) ?? null : null;
  const nome = textoLimpo(bruta?.nome, MAX_NOVA_CATEGORIA) || null;
  const tipoPorAlvo = { expense: 'saida', income: 'entrada' }[alvo?.category_type] ?? null;
  const tipo = acao === 'criar' ? (bruta?.tipo === 'entrada' ? 'entrada' : 'saida') : tipoPorAlvo;
  return { acao, tipo, alvo, nome: acao === 'excluir' ? null : nome };
}

function valorPositivo(bruto) {
  const numero = Number(bruto);
  return Number.isFinite(numero) && numero > 0 ? Math.round(numero * 100) / 100 : null;
}

// Apelido inventado vira alvo null, e o app diz que não achou a meta; nesse
// caso o nome fica com o que a pessoa disse, para a Uni dizer qual não
// achou. Prazo no passado ou a mais de dez anos é erro de leitura e sai,
// marcado para o app perguntar. Sem ação válida, o app responde como antes.
// Em aportar e retirar, a data é o dia do movimento (até hoje) e a conta é a
// ponta da transferência que a pessoa citou.
function validarMeta(bruta, { metasPorApelido, contasPorApelido, dataReferencia }) {
  const acao = ACOES_META.includes(bruta?.acao) ? bruta.acao : null;
  const alvo = acao && acao !== 'criar' ? metasPorApelido.get(bruta?.alvo) ?? null : null;
  const nomeDito = textoLimpo(bruta?.nome, MAX_NOME_META) || null;
  const movimento = acao === 'aportar' || acao === 'retirar';
  const nome = (acao === 'excluir' || acao === 'consultar' || movimento) && alvo ? null : nomeDito;
  const ajustes = [];

  let data = null;
  if (movimento) {
    // Mais de um ano para trás é data entendida, mas antiga demais para a
    // conversa: marcada à parte, para o app dizer o motivo.
    if (typeof bruta?.data === 'string' && bruta.data.trim()) {
      if (!dataValida(bruta.data) || bruta.data > dataReferencia) {
        ajustes.push('data_descartada');
      } else if (distanciaEmDias(bruta.data, dataReferencia) > MAX_DIAS_MOVIMENTO_META) {
        ajustes.push('data_antiga');
      } else {
        data = bruta.data;
      }
    }
  } else if (acao === 'criar' || acao === 'editar') {
    // String vazia é "sem prazo", não prazo errado.
    if (typeof bruta?.data === 'string' && bruta.data.trim()) {
      if (dataValida(bruta.data) && bruta.data >= dataReferencia
        && distanciaEmDias(bruta.data, dataReferencia) <= MAX_DIAS_PRAZO_META) {
        data = bruta.data;
      } else {
        ajustes.push('data_descartada');
      }
    }
  }
  const comValores = acao === 'criar' || acao === 'editar';
  return {
    acao,
    alvo,
    nome,
    valor: comValores || movimento ? valorPositivo(bruta?.valor) : null,
    data,
    porMes: comValores ? valorPositivo(bruta?.por_mes) : null,
    conta: movimento ? contasPorApelido.get(bruta?.conta) ?? null : null,
    soNaMeta: movimento && bruta?.so_na_meta === true,
    ajustes,
  };
}

// Data impossível ou longe demais sai, como no lançamento. Conta inventada
// sai. O que sobra é critério para o app achar o lançamento; sem nenhum, o
// app pergunta qual.
function validarExclusao(bruta, { contasPorApelido, dataReferencia }) {
  const data = dataValida(bruta?.data) && distanciaEmDias(bruta.data, dataReferencia) <= 366 ? bruta.data : null;
  const valorBruto = Number(bruta?.valor);
  const valor = Number.isFinite(valorBruto) && valorBruto > 0 ? Math.round(valorBruto * 100) / 100 : null;
  return {
    alvo: textoLimpo(bruta?.alvo, MAX_ALVO_EXCLUSAO) || null,
    data,
    valor,
    conta: contasPorApelido.get(bruta?.conta) ?? null,
    ultimo: bruta?.ultimo === true,
    lote: bruta?.lote === true,
  };
}

// Os critérios saem como na exclusão. A mudança sai com as chaves que o fluxo
// de edição do app usa (amount, date, accountId, categoryId, description);
// apelido inventado e data impossível saem. Sem mudança, o app pergunta o que
// mudar.
function validarEdicao(bruta, contexto) {
  const { categoriasPorApelido, contasPorApelido, dataReferencia } = contexto;
  const { alvo, data, valor, conta: contaAtual, ultimo } = validarExclusao(bruta, contexto);
  const mudancas = {};
  const novoValor = valorPositivo(bruta?.novo_valor);
  if (novoValor) mudancas.amount = novoValor;
  if (dataValida(bruta?.nova_data) && distanciaEmDias(bruta.nova_data, dataReferencia) <= 366) mudancas.date = bruta.nova_data;
  const conta = contasPorApelido.get(bruta?.nova_conta);
  if (conta) mudancas.accountId = conta.id;
  const categoria = categoriasPorApelido.get(bruta?.nova_categoria);
  if (categoria) mudancas.categoryId = categoria.id;
  const descricao = textoLimpo(bruta?.nova_descricao, MAX_DESCRICAO);
  if (descricao) mudancas.description = descricao;
  return {
    alvo, data, valor, conta: contaAtual, ultimo, mudancas,
    // Registros por extenso, para o card e a avaliação dizerem o nome.
    novaConta: conta ?? null,
    novaCategoria: categoria ?? null,
  };
}

// Recebe o JSON do modelo e o contexto que foi enviado a ele. Nunca lança:
// resposta fora do contrato vira intent 'nao_entendi', e o chamador cai no
// rascunho sem IA.
export function validarInterpretacao(bruta, { categorias = [], contas = [], metas = [], dataReferencia } = {}) {
  const intent = INTENTS.includes(bruta?.intent) ? bruta.intent : 'nao_entendi';
  const resposta = textoLimpo(bruta?.resposta, MAX_RESPOSTA);

  if (intent === 'agenda') {
    return { intent, operacoes: [], agenda: validarAgenda(bruta?.agenda), resposta };
  }

  const indice = indexarCatalogo({ categorias, contas, metas });
  const contexto = {
    categoriasPorApelido: new Map(indice.categorias.map(({ apelido, registro }) => [apelido, registro])),
    contasPorApelido: new Map(indice.contas.map(({ apelido, registro }) => [apelido, registro])),
    metasPorApelido: new Map(indice.metas.map(({ apelido, registro }) => [apelido, registro])),
    dataReferencia,
  };

  if (intent === 'consulta') {
    return { intent, operacoes: [], resposta, consulta: validarConsulta(bruta?.consulta, contexto) };
  }
  if (intent === 'categoria') {
    const categoria = validarCategoria(bruta?.categoria, contexto);
    return categoria.acao
      ? { intent, operacoes: [], resposta, categoria }
      : { intent: 'nao_entendi', operacoes: [], resposta };
  }
  if (intent === 'meta') {
    return { intent, operacoes: [], resposta, meta: validarMeta(bruta?.meta, contexto) };
  }
  if (intent === 'exclusao') {
    return { intent, operacoes: [], resposta, exclusao: validarExclusao(bruta?.exclusao, contexto) };
  }
  if (intent === 'edicao') {
    return { intent, operacoes: [], resposta, edicao: validarEdicao(bruta?.edicao, contexto) };
  }
  if (intent !== 'lancamento' && intent !== 'correcao') {
    return { intent, operacoes: [], resposta };
  }
  const operacoes = (Array.isArray(bruta.operacoes) ? bruta.operacoes : [])
    .slice(0, MAX_OPERACOES)
    .map((operacao) => validarOperacao(operacao, contexto))
    .filter(Boolean);

  if (operacoes.length === 0) {
    return { intent: 'nao_entendi', operacoes: [], resposta };
  }
  return { intent, operacoes, resposta };
}
