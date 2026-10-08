// Monta as linhas de calendar_connection_calendars a partir do calendarList do
// Google. Lógica pura, usada por calendarios.ts e testada com node --test.
//
// As linhas não levam sync_token, janela nem channel_*: o upsert com
// merge-duplicates só grava as colunas enviadas, e o estado de sync do #101
// fica preservado.

export const PAPEL_PROPRIO = 'owner';

const PAPEIS_VALIDOS = new Set(['none', 'freeBusyReader', 'reader', 'writer', 'owner']);

function papelDoItem(item) {
  return PAPEIS_VALIDOS.has(item?.accessRole) ? item.accessRole : 'none';
}

// is_read:
// - calendário que não é próprio nunca é lido (o banco recusa);
// - calendário que já existia mantém a escolha da pessoa;
// - calendário novo começa lido se for o primário ou o calendário do espaço.
export function montarCalendariosDaConexao({ itens, existentes = [], appCalendarId = null }) {
  const anteriores = new Map(existentes.map((linha) => [linha.external_calendar_id, linha]));
  const vistos = new Set();
  const linhas = [];

  for (const item of Array.isArray(itens) ? itens : []) {
    if (!item || typeof item.id !== 'string' || !item.id || item.deleted) continue;
    if (vistos.has(item.id)) continue;
    vistos.add(item.id);

    const papel = papelDoItem(item);
    const isPrimary = item.primary === true;
    const isAppCreated = Boolean(appCalendarId) && item.id === appCalendarId;
    const anterior = anteriores.get(item.id);
    const leituraPadrao = anterior ? Boolean(anterior.is_read) : (isPrimary || isAppCreated);

    linhas.push({
      external_calendar_id: item.id,
      summary: item.summaryOverride || item.summary || null,
      time_zone: item.timeZone || null,
      access_role: papel,
      is_primary: isPrimary,
      is_app_created: isAppCreated,
      is_read: papel === PAPEL_PROPRIO && leituraPadrao,
    });
  }

  const removidos = existentes
    .map((linha) => linha.external_calendar_id)
    .filter((id) => !vistos.has(id));

  return { linhas, removidos };
}

// O destino só vale se for um calendário próprio da lista. Sem isso, cai no
// calendário do espaço.
export function escolherDestino({ destinoAtual, appCalendarId, linhas }) {
  const proprios = new Set(
    linhas.filter((linha) => linha.access_role === PAPEL_PROPRIO).map((linha) => linha.external_calendar_id),
  );
  if (destinoAtual && proprios.has(destinoAtual)) return destinoAtual;
  if (appCalendarId && proprios.has(appCalendarId)) return appCalendarId;
  return null;
}

// Marca do calendário do espaço, gravada na descrição ao criar. O disconnect
// apaga a conexão e, com ela, o app_calendar_id. Na reconexão, o callback
// acha o calendário pela marca (o id do espaço, nunca o nome) e não cria outro.
const PREFIXO_DA_MARCA = 'uniflow_workspace_id=';

export function descricaoDoCalendarioDoEspaco(workspaceId) {
  return `Compromissos do UniFlow. Não apague a linha abaixo.\n${PREFIXO_DA_MARCA}${workspaceId}`;
}

export function acharCalendarioDoEspaco(itens, workspaceId) {
  if (!workspaceId) return null;
  const marca = `${PREFIXO_DA_MARCA}${workspaceId}`;
  const achado = (Array.isArray(itens) ? itens : []).find((item) => (
    item && !item.deleted
    && item.accessRole === PAPEL_PROPRIO
    && typeof item.description === 'string'
    && item.description.split(/\s+/).includes(marca)
  ));
  return achado ?? null;
}

// Valor do filtro in.(...) do PostgREST, com aspas e escape: ids do Google
// podem ter vírgula, ponto, # e parênteses.
export function listaParaFiltroIn(valores) {
  const itens = valores.map((valor) => `"${String(valor).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  return `(${itens.join(',')})`;
}
