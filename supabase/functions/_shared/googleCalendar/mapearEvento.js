// Evento do Google Agenda -> item da agenda (#101, épico #98).
//
// Lógica pura: roda no Deno (Edge Functions) e no node --test.
//
// mapearEvento lê um evento da Calendar API (singleEvents=true) e devolve os
// campos do item. decidirImportacao compara com o vínculo e o item atuais e
// diz o que fazer. planejarLote junta os dois para uma página da listagem e
// monta as operações da RPC google_calendar_import_aplicar (migration 073).
//
// Regras:
// - Evento com uniflow_workspace_id de outro espaço é ignorado.
// - Evento com a marca deste espaço e sem vínculo foi gravado pelo app: o
//   vínculo é da exportação (#100), a importação não cria outro item.
// - Privado ou confidencial não entra (a agenda do espaço é vista por todos).
//   Item que veio do Google e ficou privado é cancelado.
// - Apagado no Google: o item vira 'cancelled'. Nada é apagado.
// - Mesmo etag do vínculo: foi o próprio app que gravou, só marca como visto.
// - Conflito: vence a alteração mais recente (updated do Google contra
//   updated_at do item). Se o app vence, só grava remote_seen_at.
// - Com horário: 'meeting'. Dia inteiro: 'other'. Vários dias inteiros:
//   ends_at guarda o último dia (mesma convenção do eventoGoogle.js).
// - Pagamento (payment_due, receivable) editado no Google: data local igual
//   mantém starts_at e is_all_day; data diferente troca só a data.
// - Só entra evento novo que cruza a janela de importação.

import { DURACAO_PADRAO_MS, FUSO_PADRAO, dataLocal, ehDiaInteiro, somarDias } from './eventoGoogle.js';

export const DIAS_ANTES_DA_JANELA = 30;
export const DIAS_DEPOIS_DA_JANELA = 365;
export const TITULO_PADRAO = 'Sem título';

const DIA_MS = 24 * 60 * 60 * 1000;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIPOS_DE_PAGAMENTO = new Set(['payment_due', 'receivable']);
const VISIBILIDADES_PRIVADAS = new Set(['private', 'confidential']);

export function janelaDeImportacao(agora = new Date()) {
  const instante = new Date(agora).getTime();
  return {
    inicio: new Date(instante - DIAS_ANTES_DA_JANELA * DIA_MS).toISOString(),
    fim: new Date(instante + DIAS_DEPOIS_DA_JANELA * DIA_MS).toISOString(),
  };
}

// Diferença (ms) entre o relógio do fuso e o UTC naquele instante.
function deslocamentoDoFuso(instanteMs, fuso) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instanteMs));
  const valor = Object.fromEntries(partes.map((parte) => [parte.type, Number(parte.value)]));
  const comoUtc = Date.UTC(valor.year, valor.month - 1, valor.day, valor.hour, valor.minute, valor.second);
  // O formatador corta os milissegundos: compara com o instante cortado igual.
  return comoUtc - Math.floor(instanteMs / 1000) * 1000;
}

// Instante (ISO) de uma data e hora locais no fuso.
export function instanteNoFuso(dataIso, { hora = 0, minuto = 0, segundo = 0, ms = 0 } = {}, fuso = FUSO_PADRAO) {
  if (!DATA_RE.test(dataIso ?? '')) return null;
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  const relogio = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo, ms);
  if (Number.isNaN(relogio)) return null;
  // Duas passadas: a segunda acerta a virada de horário de verão.
  let instante = relogio - deslocamentoDoFuso(relogio, fuso);
  instante = relogio - deslocamentoDoFuso(instante, fuso);
  return new Date(instante).toISOString();
}

// Hora local de um instante no fuso.
function horaLocal(instante, fuso) {
  const data = new Date(instante);
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(data);
  const valor = Object.fromEntries(partes.map((parte) => [parte.type, Number(parte.value)]));
  return { hora: valor.hour, minuto: valor.minute, segundo: valor.second, ms: data.getUTCMilliseconds() };
}

function textoOuNulo(valor) {
  if (typeof valor !== 'string') return null;
  const texto = valor.trim();
  return texto ? texto : null;
}

function instanteValido(valor) {
  if (typeof valor !== 'string' || !valor) return null;
  const tempo = Date.parse(valor);
  return Number.isNaN(tempo) ? null : new Date(tempo).toISOString();
}

function camposDoHorario(evento, fuso) {
  const inicio = evento?.start ?? {};
  const fim = evento?.end ?? {};

  if (DATA_RE.test(inicio.date ?? '')) {
    const startsAt = instanteNoFuso(inicio.date, {}, fuso);
    // end.date é exclusivo: o último dia é a véspera.
    const ultimoDia = DATA_RE.test(fim.date ?? '') ? somarDias(fim.date, -1) : inicio.date;
    const endsAt = ultimoDia > inicio.date ? instanteNoFuso(ultimoDia, {}, fuso) : null;
    if (!startsAt) return null;
    return { starts_at: startsAt, ends_at: endsAt, is_all_day: true, has_explicit_time: false, item_type: 'other' };
  }

  const startsAt = instanteValido(inicio.dateTime);
  if (!startsAt) return null;
  const endsAtBruto = instanteValido(fim.dateTime);
  const endsAt = endsAtBruto && Date.parse(endsAtBruto) >= Date.parse(startsAt) ? endsAtBruto : null;
  return { starts_at: startsAt, ends_at: endsAt, is_all_day: false, has_explicit_time: true, item_type: 'meeting' };
}

export function mapearEvento(evento, { workspaceId, fuso = FUSO_PADRAO } = {}) {
  const externalId = typeof evento?.id === 'string' && evento.id ? evento.id : null;
  const resultado = {
    externalId,
    etag: typeof evento?.etag === 'string' ? evento.etag : null,
    updated: instanteValido(evento?.updated),
    ignorar: null,
    cancelado: evento?.status === 'cancelled',
    privado: VISIBILIDADES_PRIVADAS.has(evento?.visibility),
    doApp: false,
    campos: null,
  };
  if (!externalId) return { ...resultado, ignorar: 'sem_id' };

  const marca = evento?.extendedProperties?.private ?? {};
  const espacoDaMarca = typeof marca.uniflow_workspace_id === 'string' ? marca.uniflow_workspace_id : null;
  if (espacoDaMarca && espacoDaMarca !== workspaceId) return { ...resultado, ignorar: 'outro_espaco' };
  resultado.doApp = Boolean(espacoDaMarca);

  // Cancelado não precisa de campos; privado não pode levar o conteúdo adiante.
  if (resultado.cancelado || resultado.privado) return resultado;

  const horario = camposDoHorario(evento, fuso);
  if (!horario) return { ...resultado, ignorar: 'sem_data' };

  resultado.campos = {
    title: textoOuNulo(evento.summary) ?? TITULO_PADRAO,
    description: textoOuNulo(evento.description),
    location: textoOuNulo(evento.location),
    ...horario,
  };
  return resultado;
}

export function cruzaAJanela(campos, janela) {
  const inicio = Date.parse(campos.starts_at);
  const fim = campos.ends_at ? Date.parse(campos.ends_at) : inicio;
  return inicio < Date.parse(janela.fim) && fim >= Date.parse(janela.inicio);
}

function mesmoInstante(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  return Date.parse(a) === Date.parse(b);
}

// Campos que a importação grava num item que já existe. item_type nunca muda.
export function camposDaAtualizacao(item, campos, fuso = FUSO_PADRAO) {
  const resultado = {
    title: campos.title,
    description: campos.description,
    location: campos.location,
    starts_at: campos.starts_at,
    ends_at: campos.ends_at,
    is_all_day: campos.is_all_day,
    has_explicit_time: campos.has_explicit_time,
    // Evento de volta no Google (desfeito) reabre o item cancelado.
    status: item.status === 'cancelled' ? 'scheduled' : item.status,
  };

  if (TIPOS_DE_PAGAMENTO.has(item.item_type)) {
    const dataNova = dataLocal(campos.starts_at, fuso);
    const dataAtual = dataLocal(item.starts_at, fuso);
    resultado.is_all_day = item.is_all_day;
    resultado.has_explicit_time = item.has_explicit_time;
    if (dataNova === dataAtual) {
      resultado.starts_at = item.starts_at;
      resultado.ends_at = item.ends_at ?? null;
      return resultado;
    }
    const startsAt = instanteNoFuso(dataNova, horaLocal(item.starts_at, fuso), fuso);
    const deslocamento = Date.parse(startsAt) - Date.parse(item.starts_at);
    resultado.starts_at = startsAt;
    resultado.ends_at = item.ends_at ? new Date(Date.parse(item.ends_at) + deslocamento).toISOString() : null;
    return resultado;
  }

  if (campos.is_all_day && ehDiaInteiro(item)) {
    // Item "sem horário" continua sem horário, e "dia inteiro" continua dia inteiro.
    resultado.is_all_day = item.is_all_day;
    resultado.has_explicit_time = item.has_explicit_time;
    return resultado;
  }

  // Item com horário e sem fim vai ao Google com 30 minutos: na volta, continua sem fim.
  if (!campos.is_all_day && !item.ends_at && !ehDiaInteiro(item) && campos.ends_at
    && Date.parse(campos.ends_at) - Date.parse(campos.starts_at) === DURACAO_PADRAO_MS) {
    resultado.ends_at = null;
  }
  return resultado;
}

function semMudanca(item, campos) {
  return item.title === campos.title
    && (item.description ?? null) === campos.description
    && (item.location ?? null) === campos.location
    && mesmoInstante(item.starts_at, campos.starts_at)
    && mesmoInstante(item.ends_at, campos.ends_at)
    && Boolean(item.is_all_day) === Boolean(campos.is_all_day)
    && (item.has_explicit_time !== false) === (campos.has_explicit_time !== false)
    && item.status === campos.status;
}

// { tipo: 'ignorar' | 'inserir' | 'atualizar' | 'cancelar' | 'visto', motivo?, campos? }
export function decidirImportacao({ evento, vinculo = null, item = null, janela, fuso = FUSO_PADRAO }) {
  const temVinculo = Boolean(vinculo && item);

  if (evento.ignorar) {
    // Vínculo existente nunca fica sem remote_seen_at: a varredura o cancelaria.
    return temVinculo ? { tipo: 'visto', motivo: evento.ignorar } : { tipo: 'ignorar', motivo: evento.ignorar };
  }

  if (!temVinculo) {
    if (evento.cancelado) return { tipo: 'ignorar', motivo: 'cancelado' };
    if (evento.privado) return { tipo: 'ignorar', motivo: 'privado' };
    if (evento.doApp) return { tipo: 'ignorar', motivo: 'gravado_pelo_app' };
    if (!cruzaAJanela(evento.campos, janela)) return { tipo: 'ignorar', motivo: 'fora_da_janela' };
    return { tipo: 'inserir', campos: evento.campos };
  }

  if (vinculo.etag && evento.etag && vinculo.etag === evento.etag) return { tipo: 'visto', motivo: 'mesmo_etag' };

  const noGoogle = Date.parse(evento.updated ?? '');
  const noApp = Date.parse(item.updated_at ?? '');
  if (!Number.isNaN(noApp) && (Number.isNaN(noGoogle) || noApp > noGoogle)) {
    return { tipo: 'visto', motivo: 'app_mais_novo' };
  }

  if (evento.cancelado) {
    return item.status === 'cancelled' ? { tipo: 'visto', motivo: 'ja_cancelado' } : { tipo: 'cancelar' };
  }

  if (evento.privado) {
    if (vinculo.origin === 'provider' && item.status !== 'cancelled') return { tipo: 'cancelar', motivo: 'privado' };
    return { tipo: 'visto', motivo: 'privado' };
  }

  const campos = camposDaAtualizacao(item, evento.campos, fuso);
  if (semMudanca(item, campos)) return { tipo: 'visto', motivo: 'sem_mudanca' };
  return { tipo: 'atualizar', campos };
}

// Uma página da listagem -> operações da RPC google_calendar_import_aplicar.
// `estado` é a resposta de google_calendar_import_estado.
export function planejarLote({ eventos, estado = [], workspaceId, janela, fuso = FUSO_PADRAO }) {
  const atuais = new Map((Array.isArray(estado) ? estado : []).map((linha) => [linha.external_id, linha]));
  const operacoes = [];
  const vistos = new Set();

  for (const bruto of Array.isArray(eventos) ? eventos : []) {
    const evento = mapearEvento(bruto, { workspaceId, fuso });
    // Mesmo evento duas vezes na página: vale a última versão listada.
    if (evento.externalId && vistos.has(evento.externalId)) {
      const indice = operacoes.findIndex((operacao) => operacao.external_id === evento.externalId);
      if (indice >= 0) operacoes.splice(indice, 1);
    }
    if (evento.externalId) vistos.add(evento.externalId);

    const atual = evento.externalId ? atuais.get(evento.externalId) : null;
    const decisao = decidirImportacao({ evento, vinculo: atual?.vinculo, item: atual?.item, janela, fuso });
    if (decisao.tipo === 'ignorar') continue;

    const operacao = { tipo: decisao.tipo, external_id: evento.externalId };
    if (decisao.tipo !== 'visto') {
      operacao.etag = evento.etag;
      operacao.updated = evento.updated;
    }
    if (decisao.tipo === 'atualizar' || decisao.tipo === 'cancelar') {
      operacao.agenda_item_id = atual.item.id;
      // Texto como veio do banco: a RPC compara updated_at com precisão de microssegundo.
      operacao.esperado_updated_at = atual.item.updated_at;
    }
    if (decisao.campos) operacao.campos = decisao.campos;
    operacoes.push(operacao);
  }

  return operacoes;
}
