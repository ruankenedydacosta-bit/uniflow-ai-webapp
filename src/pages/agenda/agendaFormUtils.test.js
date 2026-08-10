import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENDA_ITEM_TYPE_LABELS,
  AGENDA_ITEM_TYPES,
  buildAgendaItemCreationPayload,
  createAgendaItemEditForm,
  createEmptyAgendaItemForm,
  buildLocalStartIso,
  formatDatetimeLocalValue,
  formatLocalDateValue,
  formatLocalTimeValue,
  getAgendaItemErrorMessage,
  isValidDatetimeLocalValue,
  normalizeDatetimeLocalToStartOfDay,
  parseDatetimeLocalValue,
  shiftEndsAtOnEdit,
  validateAgendaItemForm,
} from './agendaFormUtils.js';

// --- valores iniciais --------------------------------------------------------

test('createEmptyAgendaItemForm separa data, horario e semantica temporal', () => {
  const form = createEmptyAgendaItemForm();
  assert.deepEqual(form, {
    item_type: '',
    title: '',
    description: '',
    location: '',
    date: '',
    time: '',
    ends_at: '',
    allDay: false,
    hasExplicitTime: false,
    client_id: '',
  });
});

test('AGENDA_ITEM_TYPES cobre os 7 valores do enum da migration', () => {
  assert.deepEqual(AGENDA_ITEM_TYPES, [
    'meeting',
    'appointment',
    'task',
    'payment_due',
    'receivable',
    'reminder',
    'other',
  ]);
});

test('AGENDA_ITEM_TYPE_LABELS cobre exatamente os mesmos 7 valores de AGENDA_ITEM_TYPES, com os rotulos pt-BR aprovados (fonte unica compartilhada com AgendaPage.jsx/AgendaFormModal.jsx)', () => {
  assert.deepEqual(Object.keys(AGENDA_ITEM_TYPE_LABELS), AGENDA_ITEM_TYPES);
  assert.deepEqual(AGENDA_ITEM_TYPE_LABELS, {
    meeting: 'Reunião',
    appointment: 'Compromisso',
    task: 'Tarefa',
    payment_due: 'Vencimento',
    receivable: 'Recebimento',
    reminder: 'Lembrete',
    other: 'Outro',
  });
});

// --- conversao datetime-local <-> ISO ----------------------------------------

test('parseDatetimeLocalValue converte "YYYY-MM-DDTHH:mm" local para ISO', () => {
  const iso = parseDatetimeLocalValue('2026-07-22T14:30');
  assert.equal(typeof iso, 'string');
  const roundTrip = new Date(iso);
  assert.equal(roundTrip.getFullYear(), 2026);
  assert.equal(roundTrip.getMonth(), 6);
  assert.equal(roundTrip.getDate(), 22);
  assert.equal(roundTrip.getHours(), 14);
  assert.equal(roundTrip.getMinutes(), 30);
});

test('parseDatetimeLocalValue com valor vazio retorna null', () => {
  assert.equal(parseDatetimeLocalValue(''), null);
  assert.equal(parseDatetimeLocalValue(null), null);
  assert.equal(parseDatetimeLocalValue(undefined), null);
});

test('parseDatetimeLocalValue com valor invalido retorna null', () => {
  assert.equal(parseDatetimeLocalValue('nao-e-uma-data'), null);
});

test('isValidDatetimeLocalValue: vazio e valido (campo opcional por padrao)', () => {
  assert.equal(isValidDatetimeLocalValue(''), true);
  assert.equal(isValidDatetimeLocalValue(null), true);
});

test('isValidDatetimeLocalValue: valor valido retorna true, invalido retorna false', () => {
  assert.equal(isValidDatetimeLocalValue('2026-07-22T14:30'), true);
  assert.equal(isValidDatetimeLocalValue('nao-e-uma-data'), false);
});

test('normalizeDatetimeLocalToStartOfDay zera o horario para 00:00 local', () => {
  const iso = normalizeDatetimeLocalToStartOfDay('2026-07-22T14:30');
  const date = new Date(iso);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 6);
  assert.equal(date.getDate(), 22);
  assert.equal(date.getHours(), 0);
  assert.equal(date.getMinutes(), 0);
  assert.equal(date.getSeconds(), 0);
});

test('normalizeDatetimeLocalToStartOfDay com valor vazio/invalido retorna null', () => {
  assert.equal(normalizeDatetimeLocalToStartOfDay(''), null);
  assert.equal(normalizeDatetimeLocalToStartOfDay('nao-e-uma-data'), null);
});

test('formatDatetimeLocalValue converte ISO/timestamptz para "YYYY-MM-DDTHH:mm" em hora local', () => {
  const iso = new Date(2026, 6, 22, 14, 30, 0, 0).toISOString();
  assert.equal(formatDatetimeLocalValue(iso), '2026-07-22T14:30');
});

test('formatDatetimeLocalValue com valor vazio/invalido retorna string vazia (nunca "Invalid Date")', () => {
  assert.equal(formatDatetimeLocalValue(''), '');
  assert.equal(formatDatetimeLocalValue(null), '');
  assert.equal(formatDatetimeLocalValue(undefined), '');
  assert.equal(formatDatetimeLocalValue('nao-e-uma-data'), '');
});

test('formatDatetimeLocalValue e parseDatetimeLocalValue fazem round-trip (mesmo horario local preservado)', () => {
  const localValue = '2026-07-22T14:30';
  const iso = parseDatetimeLocalValue(localValue);
  assert.equal(formatDatetimeLocalValue(iso), localValue);
});

// --- mapeamento para edicao --------------------------------------------------

function makeAgendaItem(overrides = {}) {
  return {
    id: 'item-1',
    workspace_id: 'w1',
    item_type: 'meeting',
    title: 'Reunião com cliente',
    description: 'Pauta inicial',
    location: 'Escritório',
    starts_at: '2026-07-22T17:30:00.000Z',
    ends_at: '2026-07-22T18:30:00.000Z',
    is_all_day: false,
    has_explicit_time: true,
    status: 'scheduled',
    client_id: 'client-1',
    assigned_user_id: null,
    created_by: 'u1',
    created_at: '2026-07-20T10:00:00.000Z',
    updated_at: '2026-07-20T10:00:00.000Z',
    ...overrides,
  };
}

test('createAgendaItemEditForm mapeia um item real, todos os campos preenchidos', () => {
  const item = makeAgendaItem();
  const form = createAgendaItemEditForm(item);

  assert.equal(form.item_type, 'meeting');
  assert.equal(form.title, 'Reunião com cliente');
  assert.equal(form.description, 'Pauta inicial');
  assert.equal(form.location, 'Escritório');
  assert.equal(form.date, formatLocalDateValue(item.starts_at));
  assert.equal(form.time, formatLocalTimeValue(item.starts_at));
  assert.equal(form.ends_at, formatDatetimeLocalValue(item.ends_at));
  assert.equal(form.allDay, false);
  assert.equal(form.hasExplicitTime, true);
  assert.equal(form.client_id, 'client-1');
});

test('createAgendaItemEditForm: description, location, ends_at e client_id nulos viram string vazia', () => {
  const form = createAgendaItemEditForm(
    makeAgendaItem({ description: null, location: null, ends_at: null, client_id: null }),
  );

  assert.equal(form.description, '');
  assert.equal(form.location, '');
  assert.equal(form.ends_at, '');
  assert.equal(form.client_id, '');
});

test('createAgendaItemEditForm: is_all_day true forca ends_at para "" mesmo com ends_at nao-nulo no registro', () => {
  const form = createAgendaItemEditForm(
    makeAgendaItem({ is_all_day: true, ends_at: '2026-07-22T18:30:00.000Z' }),
  );

  assert.equal(form.allDay, true);
  assert.equal(form.hasExplicitTime, false);
  assert.equal(form.time, '');
  assert.equal(form.ends_at, '');
});

test('createAgendaItemEditForm: payload resultante (via buildAgendaItemCreationPayload) continua sem campos imutaveis', () => {
  const form = createAgendaItemEditForm(makeAgendaItem());
  const payload = buildAgendaItemCreationPayload(form);

  assert.equal('id' in payload, false);
  assert.equal('status' in payload, false);
  assert.equal('assigned_user_id' in payload, false);
  assert.equal('workspace_id' in payload, false);
  assert.equal('created_by' in payload, false);
  assert.equal('created_at' in payload, false);
  assert.equal('updated_at' in payload, false);
});

// --- validacao ----------------------------------------------------------------

function validForm(overrides = {}) {
  return {
    item_type: 'meeting',
    title: 'Reunião com cliente',
    description: '',
    location: '',
    date: '2026-07-22',
    time: '14:30',
    ends_at: '',
    allDay: false,
    hasExplicitTime: true,
    client_id: '',
    ...overrides,
  };
}

test('validateAgendaItemForm: titulo e obrigatorio', () => {
  assert.equal(
    validateAgendaItemForm(validForm({ title: '' })),
    'Título do compromisso é obrigatório.',
  );
  assert.equal(
    validateAgendaItemForm(validForm({ title: '   ' })),
    'Título do compromisso é obrigatório.',
  );
});

test('validateAgendaItemForm: item_type e obrigatorio e deve estar no enum', () => {
  assert.equal(
    validateAgendaItemForm(validForm({ item_type: '' })),
    'Selecione o tipo do compromisso.',
  );
  assert.equal(
    validateAgendaItemForm(validForm({ item_type: 'invalido' })),
    'Selecione o tipo do compromisso.',
  );
});

test('validateAgendaItemForm: data e obrigatoria sem exigir horario', () => {
  assert.equal(
    validateAgendaItemForm(validForm({ date: '' })),
    'Data do compromisso é obrigatória.',
  );
  assert.equal(
    validateAgendaItemForm(validForm({ time: '', hasExplicitTime: false })),
    null,
  );
});

test('validateAgendaItemForm: ends_at invalido e rejeitado', () => {
  assert.equal(
    validateAgendaItemForm(validForm({ ends_at: 'nao-e-uma-data' })),
    'Data e hora de término inválidas.',
  );
});

test('validateAgendaItemForm: ends_at anterior a starts_at e rejeitado', () => {
  assert.equal(
    validateAgendaItemForm(
      validForm({ ends_at: '2026-07-22T10:00' }),
    ),
    'A data e hora de término deve ser igual ou posterior ao início.',
  );
});

test('validateAgendaItemForm: ends_at igual a starts_at e valido', () => {
  assert.equal(
    validateAgendaItemForm(
      validForm({ ends_at: '2026-07-22T14:30' }),
    ),
    null,
  );
});

test('validateAgendaItemForm: ends_at nao e validado contra starts_at quando is_all_day', () => {
  assert.equal(
    validateAgendaItemForm(
      validForm({
        time: '',
        ends_at: '',
        allDay: true,
        hasExplicitTime: false,
      }),
    ),
    null,
  );
});

test('validateAgendaItemForm: formulario valido retorna null', () => {
  assert.equal(validateAgendaItemForm(validForm()), null);
});

// --- payload de criacao --------------------------------------------------------

test('buildAgendaItemCreationPayload monta o payload normal com todos os campos', () => {
  const payload = buildAgendaItemCreationPayload(
    validForm({
      title: '  Reunião com cliente  ',
      description: 'Pauta inicial',
      location: 'Escritório',
      ends_at: '2026-07-22T15:30',
      client_id: 'client-1',
    }),
  );

  assert.equal(payload.item_type, 'meeting');
  assert.equal(payload.title, 'Reunião com cliente');
  assert.equal(payload.description, 'Pauta inicial');
  assert.equal(payload.location, 'Escritório');
  assert.equal(payload.is_all_day, false);
  assert.equal(payload.has_explicit_time, true);
  assert.equal(payload.client_id, 'client-1');
  assert.equal(typeof payload.starts_at, 'string');
  assert.equal(typeof payload.ends_at, 'string');
});

test('buildAgendaItemCreationPayload: campos opcionais vazios viram null', () => {
  const payload = buildAgendaItemCreationPayload(validForm());

  assert.equal(payload.description, null);
  assert.equal(payload.location, null);
  assert.equal(payload.ends_at, null);
  assert.equal(payload.client_id, null);
});

test('buildAgendaItemCreationPayload: dia inteiro usa ancora local e marca horario como nao explicito', () => {
  const payload = buildAgendaItemCreationPayload(
    validForm({ time: '', ends_at: '2026-07-22T18:00', allDay: true, hasExplicitTime: false }),
  );

  assert.equal(payload.ends_at, null);
  assert.equal(payload.is_all_day, true);
  assert.equal(payload.has_explicit_time, false);

  const startsAtDate = new Date(payload.starts_at);
  assert.equal(startsAtDate.getHours(), 0);
  assert.equal(startsAtDate.getMinutes(), 0);
});

test('buildAgendaItemCreationPayload distingue sem horario de 00:00 explicito', () => {
  const withoutTime = buildAgendaItemCreationPayload(
    validForm({ time: '', hasExplicitTime: false }),
  );
  const midnight = buildAgendaItemCreationPayload(
    validForm({ time: '00:00', hasExplicitTime: true }),
  );

  assert.equal(withoutTime.has_explicit_time, false);
  assert.equal(midnight.has_explicit_time, true);
  assert.equal(new Date(withoutTime.starts_at).getHours(), 0);
  assert.equal(new Date(midnight.starts_at).getHours(), 0);
});

test('buildLocalStartIso combina data e horario locais sem reinterpretar o titulo', () => {
  const date = new Date(buildLocalStartIso('2026-08-11', '15:30'));
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 7);
  assert.equal(date.getDate(), 11);
  assert.equal(date.getHours(), 15);
  assert.equal(date.getMinutes(), 30);
});

test('createAgendaItemEditForm cobre transicoes horario, sem horario e dia inteiro', () => {
  const withoutTime = createAgendaItemEditForm(makeAgendaItem({ has_explicit_time: false }));
  assert.equal(withoutTime.time, '');
  assert.equal(withoutTime.hasExplicitTime, false);
  assert.equal(withoutTime.allDay, false);

  const legacy = createAgendaItemEditForm(makeAgendaItem({ has_explicit_time: undefined }));
  assert.equal(legacy.hasExplicitTime, true);
  assert.equal(legacy.time, formatLocalTimeValue(makeAgendaItem().starts_at));
});

test('edicao sem horario -> horario normal preserva titulo e descricao', () => {
  const form = createAgendaItemEditForm(makeAgendaItem({ has_explicit_time: false }));
  const payload = buildAgendaItemCreationPayload({
    ...form,
    time: '16:45',
    hasExplicitTime: true,
  });
  assert.equal(payload.title, 'Reunião com cliente');
  assert.equal(payload.description, 'Pauta inicial');
  assert.equal(payload.has_explicit_time, true);
  assert.equal(payload.is_all_day, false);
  assert.equal(new Date(payload.starts_at).getHours(), 16);
  assert.equal(new Date(payload.starts_at).getMinutes(), 45);
});

test('edicao com horario -> sem horario limpa somente a semantica temporal', () => {
  const form = createAgendaItemEditForm(makeAgendaItem());
  const payload = buildAgendaItemCreationPayload({
    ...form,
    time: '',
    ends_at: '',
    hasExplicitTime: false,
  });
  assert.equal(payload.title, 'Reunião com cliente');
  assert.equal(payload.description, 'Pauta inicial');
  assert.equal(payload.has_explicit_time, false);
  assert.equal(payload.is_all_day, false);
  assert.equal(payload.ends_at, null);
});

test('edicao dia inteiro -> horario normal e horario normal -> dia inteiro', () => {
  const allDayForm = createAgendaItemEditForm(makeAgendaItem({ is_all_day: true }));
  const scheduled = buildAgendaItemCreationPayload({
    ...allDayForm,
    allDay: false,
    time: '09:15',
    hasExplicitTime: true,
  });
  assert.equal(scheduled.is_all_day, false);
  assert.equal(scheduled.has_explicit_time, true);
  assert.equal(new Date(scheduled.starts_at).getHours(), 9);

  const timedForm = createAgendaItemEditForm(makeAgendaItem());
  const allDay = buildAgendaItemCreationPayload({
    ...timedForm,
    allDay: true,
    time: '',
    hasExplicitTime: false,
  });
  assert.equal(allDay.is_all_day, true);
  assert.equal(allDay.has_explicit_time, false);
  assert.equal(allDay.ends_at, null);
});

test('buildAgendaItemCreationPayload: nunca inclui status, assigned_user_id, workspace_id ou created_by', () => {
  const payload = buildAgendaItemCreationPayload(validForm());
  assert.equal('status' in payload, false);
  assert.equal('assigned_user_id' in payload, false);
  assert.equal('workspace_id' in payload, false);
  assert.equal('created_by' in payload, false);
});

test('shiftEndsAtOnEdit: move para data futura preservando a duracao (anti-trava do formulario simplificado)', () => {
  const moved = shiftEndsAtOnEdit(
    '2026-07-08T13:00:00.000Z',
    '2026-07-08T14:30:00.000Z',
    '2026-07-08T11:30',
    '2026-07-10T15:00',
  );
  const expected = formatDatetimeLocalValue(
    new Date(new Date('2026-07-10T15:00').getTime() + 90 * 60 * 1000).toISOString(),
  );
  assert.equal(moved, expected);
});

test('shiftEndsAtOnEdit: sem ends_at original devolve o valor atual intacto', () => {
  assert.equal(
    shiftEndsAtOnEdit('2026-07-08T13:00:00.000Z', null, '', '2026-07-10T15:00'),
    '',
  );
});

test('shiftEndsAtOnEdit: datas invalidas nao alteram ends_at', () => {
  assert.equal(
    shiftEndsAtOnEdit('nao-e-data', '2026-07-08T14:30:00.000Z', '2026-07-08T11:30', '2026-07-10T15:00'),
    '2026-07-08T11:30',
  );
  assert.equal(
    shiftEndsAtOnEdit('2026-07-08T13:00:00.000Z', '2026-07-08T14:30:00.000Z', '2026-07-08T11:30', null),
    '2026-07-08T11:30',
  );
});

test('shiftEndsAtOnEdit: ends_at anterior ao inicio nao vira fonte de duracao', () => {
  assert.equal(
    shiftEndsAtOnEdit('2026-07-08T15:00:00.000Z', '2026-07-08T10:00:00.000Z', '2026-07-08T11:30', '2026-07-09T09:00'),
    '2026-07-08T11:30',
  );
});

// --- traducao de erros ----------------------------------------------------------

test('getAgendaItemErrorMessage: sem erro retorna string vazia', () => {
  assert.equal(getAgendaItemErrorMessage(null, 'fallback'), '');
});

test('getAgendaItemErrorMessage: codigos seguros retornam a mensagem original', () => {
  assert.equal(
    getAgendaItemErrorMessage(
      { code: 'INVALID_AGENDA_ITEM_REQUEST', message: 'Titulo do item de agenda e obrigatorio.' },
      'fallback',
    ),
    'Titulo do item de agenda e obrigatorio.',
  );
  assert.equal(
    getAgendaItemErrorMessage(
      { code: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase ainda nao esta configurado.' },
      'fallback',
    ),
    'Supabase ainda nao esta configurado.',
  );
});

test('getAgendaItemErrorMessage: AGENDA_ITEM_NOT_FOUND e um codigo seguro (item removido/inacessivel entre a abertura do modal e o submit da edicao)', () => {
  assert.equal(
    getAgendaItemErrorMessage(
      { code: 'AGENDA_ITEM_NOT_FOUND', message: 'Item de agenda nao encontrado para atualizacao.' },
      'fallback',
    ),
    'Item de agenda nao encontrado para atualizacao.',
  );
});

test('getAgendaItemErrorMessage: conflito otimista usa mensagem segura do dominio', () => {
  assert.equal(
    getAgendaItemErrorMessage(
      { code: 'AGENDA_ITEM_CONFLICT', message: 'Este compromisso foi alterado em outro lugar.' },
      'fallback',
    ),
    'Este compromisso foi alterado em outro lugar.',
  );
});

test('getAgendaItemErrorMessage: erro cru de cliente de outro workspace vira mensagem amigavel', () => {
  assert.equal(
    getAgendaItemErrorMessage(
      { code: '23514', message: 'agenda_items: client belongs to a different workspace' },
      'fallback',
    ),
    'Cliente não pertence a este espaço de trabalho. Atualize a página e tente novamente.',
  );
});

test('getAgendaItemErrorMessage: erro cru de cliente inexistente vira mensagem amigavel', () => {
  assert.equal(
    getAgendaItemErrorMessage(
      { code: 'P0001', message: 'agenda_items: client abc123 not found or not accessible' },
      'fallback',
    ),
    'Cliente não encontrado ou não pertence mais a este espaço de trabalho.',
  );
});

test('getAgendaItemErrorMessage: erro desconhecido usa o fallback, nunca a mensagem crua', () => {
  assert.equal(
    getAgendaItemErrorMessage(
      { code: '42P01', message: 'algum erro interno de banco' },
      'Não foi possível criar o compromisso. Tente novamente.',
    ),
    'Não foi possível criar o compromisso. Tente novamente.',
  );
});
