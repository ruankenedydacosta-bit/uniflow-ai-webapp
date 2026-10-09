// Item da agenda -> evento do Google Agenda (#100, épico #98).
//
// Lógica pura: roda no Deno (Edge Functions) e no node --test.
//
// - Dia inteiro: is_all_day, sem horário explícito (has_explicit_time =
//   false) ou pagamento (payment_due, receivable). Vai com start.date e
//   end.date (exclusivo) no fuso da pessoa. Converter o timestamptz em UTC
//   sem o fuso joga o evento para o dia anterior.
// - Dia inteiro com ends_at: a data local de ends_at é o último dia do
//   evento. O #101 grava ends_at com a mesma convenção ao importar.
// - Com horário e sem fim: 30 minutos.
// - Todo evento leva extendedProperties.private.uniflow_item_id e
//   uniflow_workspace_id. O #101 usa isso para não trazer o próprio evento.

export const FUSO_PADRAO = 'America/Sao_Paulo';
export const DURACAO_PADRAO_MS = 30 * 60 * 1000;

const TIPOS_DE_PAGAMENTO = new Set(['payment_due', 'receivable']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehDiaInteiro(item) {
  return item.is_all_day === true
    || item.has_explicit_time === false
    || TIPOS_DE_PAGAMENTO.has(item.item_type);
}

// 'YYYY-MM-DD' do instante no fuso dado.
export function dataLocal(instante, fuso = FUSO_PADRAO) {
  const data = new Date(instante);
  if (Number.isNaN(data.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(data);
}

export function somarDias(dataIso, dias) {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia + dias));
  return data.toISOString().slice(0, 10);
}

// Id do evento derivado do item: o mesmo item sempre gera o mesmo id. Uma
// nova tentativa depois de um insert que deu certo recebe 409 em vez de
// duplicar o evento. O Google aceita só a-v e 0-9 (base32hex), e o hex do
// UUID cabe nisso.
export function idDoEventoGoogle(itemId) {
  if (typeof itemId !== 'string' || !UUID_RE.test(itemId)) return null;
  return `uf${itemId.replaceAll('-', '').toLowerCase()}`;
}

// Corpo do insert e do PATCH. Os campos vazios vão como '' e o lado que não
// vale de start/end vai como null, para o PATCH limpar o valor antigo no
// Google (troca de horário para dia inteiro e vice-versa).
export function montarEventoGoogle(item, { fuso = FUSO_PADRAO } = {}) {
  const evento = {
    summary: item.title,
    description: item.description ?? '',
    location: item.location ?? '',
    status: 'confirmed',
    extendedProperties: {
      private: {
        uniflow_item_id: item.id,
        uniflow_workspace_id: item.workspace_id,
      },
    },
  };

  if (ehDiaInteiro(item)) {
    const primeiroDia = dataLocal(item.starts_at, fuso);
    const ultimoInformado = item.ends_at ? dataLocal(item.ends_at, fuso) : null;
    const ultimoDia = ultimoInformado && ultimoInformado > primeiroDia ? ultimoInformado : primeiroDia;
    evento.start = { date: primeiroDia, dateTime: null, timeZone: null };
    evento.end = { date: somarDias(ultimoDia, 1), dateTime: null, timeZone: null };
    // Dia inteiro não ocupa a agenda: pagamento não pode marcar o dia como ocupado.
    evento.transparency = 'transparent';
    return evento;
  }

  const inicio = new Date(item.starts_at);
  const fim = item.ends_at ? new Date(item.ends_at) : new Date(inicio.getTime() + DURACAO_PADRAO_MS);
  evento.start = { dateTime: inicio.toISOString(), timeZone: fuso, date: null };
  evento.end = { dateTime: fim.toISOString(), timeZone: fuso, date: null };
  evento.transparency = 'opaque';
  return evento;
}

// No insert não há valor antigo para limpar: os null saem do corpo.
export function corpoDeInsercao(evento, eventId) {
  const semNulos = (objeto) => Object.fromEntries(Object.entries(objeto).filter(([, valor]) => valor !== null));
  return { ...evento, id: eventId, start: semNulos(evento.start), end: semNulos(evento.end) };
}
