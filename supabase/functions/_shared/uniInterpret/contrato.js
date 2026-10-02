// Contrato do uni-interpret (épico #104, F1): o schema que o modelo é
// obrigado a seguir e a validação de domínio que roda depois dele.
//
// JS puro, sem dependência: a Edge Function (Deno) e os testes/avaliação
// (node --test) importam o mesmo arquivo. O schema obriga o modelo a escolher
// categoria e conta entre os ids do próprio workspace; a validação confere de
// novo, porque schema garante formato, não regra de negócio.

export const INTENTS = Object.freeze(['lancamento', 'consulta', 'agenda', 'correcao', 'conversa', 'nao_entendi']);
export const TIPOS = Object.freeze(['saida', 'entrada', 'transferencia']);

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

function idsOuNulo(ids) {
  return { type: ['string', 'null'], enum: [...ids, null] };
}

// Schema estrito: todo campo é obrigatório e ausência vira null, que é o que
// o modo strict dos provedores aceita.
export function montarEsquema({ categorias = [], contas = [] } = {}) {
  const idsCategorias = categorias.map((categoria) => categoria.id);
  const idsContas = contas.map((conta) => conta.id);

  const operacao = {
    type: 'object',
    additionalProperties: false,
    required: [
      'tipo', 'valor', 'data', 'descricao', 'categoria_id', 'nova_categoria',
      'alternativas', 'conta_id', 'conta_destino_id', 'confianca',
    ],
    properties: {
      tipo: { type: 'string', enum: [...TIPOS] },
      valor: { type: ['number', 'null'] },
      data: { type: ['string', 'null'], description: 'AAAA-MM-DD' },
      descricao: { type: 'string' },
      categoria_id: idsOuNulo(idsCategorias),
      nova_categoria: { type: ['string', 'null'] },
      alternativas: { type: 'array', items: { type: 'string', enum: idsCategorias } },
      conta_id: idsOuNulo(idsContas),
      conta_destino_id: idsOuNulo(idsContas),
      confianca: { type: 'number' },
    },
  };

  return {
    type: 'object',
    additionalProperties: false,
    required: ['intent', 'operacoes', 'resposta'],
    properties: {
      intent: { type: 'string', enum: [...INTENTS] },
      operacoes: { type: 'array', items: operacao },
      resposta: { type: 'string' },
    },
  };
}

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

function validarOperacao(bruta, { categoriasPorId, contasPorId, dataReferencia }) {
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

  const categoriaDoTipo = (id) => {
    const categoria = categoriasPorId.get(id);
    return categoria && categoria.category_type === categoryType ? categoria : null;
  };

  let categoria = bruta.categoria_id ? categoriaDoTipo(bruta.categoria_id) : null;
  if (bruta.categoria_id && !categoria) ajustes.push('categoria_incompativel');

  const novaCategoria = categoria ? null : (textoLimpo(bruta.nova_categoria, MAX_NOVA_CATEGORIA) || null);

  const alternativas = [];
  for (const id of Array.isArray(bruta.alternativas) ? bruta.alternativas : []) {
    const alternativa = categoriaDoTipo(id);
    if (alternativa && alternativa.id !== categoria?.id && !alternativas.includes(alternativa)) {
      alternativas.push(alternativa);
    }
    if (alternativas.length === MAX_ALTERNATIVAS) break;
  }

  const conta = contasPorId.get(bruta.conta_id) ?? null;
  const contaDestino = tipo === 'transferencia' ? contasPorId.get(bruta.conta_destino_id) ?? null : null;

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
    faltando,
    ajustes,
  };
}

// Recebe o JSON do modelo e o contexto que foi enviado a ele. Nunca lança:
// resposta fora do contrato vira intent 'nao_entendi', e o chamador cai no
// rascunho sem IA.
export function validarInterpretacao(bruta, { categorias = [], contas = [], dataReferencia } = {}) {
  const intent = INTENTS.includes(bruta?.intent) ? bruta.intent : 'nao_entendi';
  const resposta = textoLimpo(bruta?.resposta, MAX_RESPOSTA);

  if (intent !== 'lancamento' && intent !== 'correcao') {
    return { intent, operacoes: [], resposta };
  }

  const contexto = {
    categoriasPorId: new Map(categorias.map((categoria) => [categoria.id, categoria])),
    contasPorId: new Map(contas.map((conta) => [conta.id, conta])),
    dataReferencia,
  };
  const operacoes = (Array.isArray(bruta.operacoes) ? bruta.operacoes : [])
    .slice(0, MAX_OPERACOES)
    .map((operacao) => validarOperacao(operacao, contexto))
    .filter(Boolean);

  if (operacoes.length === 0) {
    return { intent: 'nao_entendi', operacoes: [], resposta };
  }
  return { intent, operacoes, resposta };
}
