// Fluxo do uni-interpret (épico #104, F1), sem Deno nem rede: o index.ts
// injeta quem carrega o contexto (PostgREST com o JWT do usuário, portanto
// sob RLS) e quem chama o modelo. Assim o fluxo inteiro roda no node --test.
//
// Nunca grava nada: devolve a proposta validada para o card de confirmação.

import { validarInterpretacao } from './contrato.js';
import { INSTRUCOES, montarMensagemUsuario } from './prompt.js';

export const MAX_FRASE = 400;
export const MAX_HISTORICO = 6;
export const MAX_TURNO = 300;
export const MAX_RASCUNHO = 2000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Motivo do adaptador → status HTTP. O frontend trata qualquer falha como
// "IA indisponível" e cai no rascunho sem IA; o status só separa o que vale
// tentar de novo (429, 504) do que não vale.
const STATUS_POR_MOTIVO = {
  chave_invalida: 503,
  sem_cota: 503,
  limite: 429,
  tempo_esgotado: 504,
  recusa: 502,
  cortada: 502,
  json_invalido: 502,
  provedor: 502,
  rede: 502,
};

function texto(valor, max) {
  if (typeof valor !== 'string') return '';
  // eslint-disable-next-line no-control-regex -- remove caractere de controle vindo do cliente
  return valor.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

// Data de hoje no fuso do usuário, AAAA-MM-DD.
export function dataEmSaoPaulo(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora);
}

export function lerEntrada(corpo) {
  const registro = corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {};
  const workspaceId = typeof registro.workspaceId === 'string' && UUID.test(registro.workspaceId)
    ? registro.workspaceId
    : null;
  const frase = texto(registro.frase, MAX_FRASE);

  const historico = (Array.isArray(registro.historico) ? registro.historico : [])
    .slice(-MAX_HISTORICO)
    .map((turno) => ({ autor: turno?.autor === 'uni' ? 'uni' : 'usuario', texto: texto(turno?.texto, MAX_TURNO) }))
    .filter((turno) => turno.texto);

  let rascunho = null;
  if (registro.rascunho && typeof registro.rascunho === 'object' && !Array.isArray(registro.rascunho)) {
    const serializado = JSON.stringify(registro.rascunho);
    if (serializado.length <= MAX_RASCUNHO) rascunho = registro.rascunho;
  }

  return { workspaceId, frase, historico, rascunho };
}

function paraCliente(registro) {
  return registro ? { id: registro.id, name: registro.name } : null;
}

// Formato que o frontend recebe: só ids e nomes, nunca o registro inteiro.
function serializar(validada) {
  const { consulta, categoria, meta } = validada;
  return {
    intent: validada.intent,
    ...(validada.agenda ? { agenda: validada.agenda } : {}),
    ...(categoria ? {
      categoria: { acao: categoria.acao, tipo: categoria.tipo, alvo: paraCliente(categoria.alvo), nome: categoria.nome },
    } : {}),
    ...(meta ? {
      meta: {
        acao: meta.acao,
        alvo: paraCliente(meta.alvo),
        nome: meta.nome,
        valor: meta.valor,
        data: meta.data,
        porMes: meta.porMes,
        conta: paraCliente(meta.conta),
        soNaMeta: meta.soNaMeta,
        ajustes: meta.ajustes,
      },
    } : {}),
    ...(validada.exclusao ? {
      exclusao: { ...validada.exclusao, conta: paraCliente(validada.exclusao.conta) },
    } : {}),
    ...(validada.edicao ? {
      edicao: {
        ...validada.edicao,
        conta: paraCliente(validada.edicao.conta),
        novaConta: paraCliente(validada.edicao.novaConta),
        novaCategoria: paraCliente(validada.edicao.novaCategoria),
      },
    } : {}),
    ...(consulta ? {
      consulta: {
        tipo: consulta.tipo,
        inicio: consulta.inicio,
        fim: consulta.fim,
        categoria: paraCliente(consulta.categoria),
        conta: paraCliente(consulta.conta),
        termo: consulta.termo,
      },
    } : {}),
    resposta: validada.resposta,
    operacoes: validada.operacoes.map((operacao) => ({
      tipo: operacao.tipo,
      valor: operacao.valor,
      data: operacao.data,
      descricao: operacao.descricao,
      categoria: paraCliente(operacao.categoria),
      novaCategoria: operacao.novaCategoria,
      alternativas: operacao.alternativas.map(paraCliente),
      conta: paraCliente(operacao.conta),
      contaDestino: paraCliente(operacao.contaDestino),
      confianca: operacao.confianca,
      parcelas: operacao.parcelas,
      recorrente: operacao.recorrente,
      frequencia: operacao.frequencia,
      intervalo: operacao.intervalo,
      faltando: operacao.faltando,
      ajustes: operacao.ajustes,
    })),
  };
}

// carregarContexto(workspaceId) → { workspaceType, categorias, contas, metas, memorias } ou null
//   quando o usuário não enxerga o workspace (RLS).
// chamarModelo({ instrucoes, mensagem }) → resultado de provedores.js.
// Devolve { status, corpo, metrica }; metrica não carrega texto do usuário.
export async function interpretarFrase({ corpo, carregarContexto, chamarModelo, agora = new Date() }) {
  const entrada = lerEntrada(corpo);
  if (!entrada.workspaceId || !entrada.frase) {
    return { status: 400, corpo: { error: 'Não foi possível ler esta solicitação.' }, metrica: { motivo: 'entrada_invalida' } };
  }

  const contexto = await carregarContexto(entrada.workspaceId);
  if (!contexto) {
    return { status: 403, corpo: { error: 'Você não tem acesso a este espaço.' }, metrica: { motivo: 'sem_acesso' } };
  }

  const dataReferencia = dataEmSaoPaulo(agora);
  const mensagem = montarMensagemUsuario({
    frase: entrada.frase,
    dataReferencia,
    workspaceType: contexto.workspaceType,
    categorias: contexto.categorias,
    contas: contexto.contas,
    metas: contexto.metas ?? [],
    memorias: contexto.memorias ?? [],
    rascunho: entrada.rascunho,
    historico: entrada.historico,
  });

  const inicio = Date.now();
  const chamada = await chamarModelo({ instrucoes: INSTRUCOES, mensagem });
  const duracaoMs = Date.now() - inicio;

  if (!chamada.ok) {
    return {
      status: STATUS_POR_MOTIVO[chamada.motivo] ?? 502,
      corpo: { error: 'A Uni não conseguiu interpretar agora.', motivo: chamada.motivo },
      metrica: { motivo: chamada.motivo, modelo: chamada.modelo, duracaoMs, statusProvedor: chamada.status ?? null },
    };
  }

  const validada = validarInterpretacao(chamada.bruta, {
    categorias: contexto.categorias,
    contas: contexto.contas,
    metas: contexto.metas ?? [],
    dataReferencia,
  });

  return {
    status: 200,
    corpo: { ...serializar(validada), dataReferencia },
    metrica: {
      motivo: 'ok',
      modelo: chamada.modelo,
      duracaoMs,
      intent: validada.intent,
      operacoes: validada.operacoes.length,
      tokensEntrada: chamada.uso.entrada,
      tokensSaida: chamada.uso.saida,
    },
  };
}
