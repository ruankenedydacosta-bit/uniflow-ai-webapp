import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClientMutationPayload,
  createClientEditForm,
  createEmptyClientForm,
  formatDatetimeLocalValue,
  getClientErrorMessage,
  isValidDatetimeLocalValue,
  parseDatetimeLocalValue,
  validateClientForm,
} from './clientFormUtils.js';

// --- valores iniciais de criacao --------------------------------------------

test('createEmptyClientForm retorna os 11 campos do schema, com defaults seguros', () => {
  const form = createEmptyClientForm();
  assert.deepEqual(form, {
    name: '',
    entity_type: 'person',
    lifecycle_stage: 'lead',
    relationship_status: '',
    primary_contact_name: '',
    email: '',
    phone: '',
    document_number: '',
    estimated_value: '',
    last_contact_at: '',
    next_action: '',
  });
});

// --- mapeamento para edicao --------------------------------------------------

test('createClientEditForm mapeia um cliente real, incluindo null -> string vazia', () => {
  const client = {
    id: 'c1',
    workspace_id: 'w1',
    name: 'Cliente Alfa',
    entity_type: 'company',
    lifecycle_stage: 'active',
    relationship_status: 'in_negotiation',
    primary_contact_name: null,
    email: null,
    phone: '11999998888',
    document_number: null,
    estimated_value: 1500.5,
    last_contact_at: '2026-07-20T14:30:00.000Z',
    next_action: null,
    assigned_user_id: null,
    is_archived: false,
    created_by: 'u1',
  };

  const form = createClientEditForm(client);

  assert.equal(form.name, 'Cliente Alfa');
  assert.equal(form.entity_type, 'company');
  assert.equal(form.lifecycle_stage, 'active');
  assert.equal(form.relationship_status, 'in_negotiation');
  assert.equal(form.primary_contact_name, '');
  assert.equal(form.email, '');
  assert.equal(form.phone, '11999998888');
  assert.equal(form.document_number, '');
  assert.equal(form.estimated_value, '1500.5');
  assert.equal(form.next_action, '');
  assert.match(form.last_contact_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test('createClientEditForm nao produz assigned_user_id/workspace_id/created_by/is_archived', () => {
  const client = { id: 'c1', workspace_id: 'w1', name: 'X', assigned_user_id: 'u2', created_by: 'u1', is_archived: false };
  const form = createClientEditForm(client);
  assert.equal('assigned_user_id' in form, false);
  assert.equal('workspace_id' in form, false);
  assert.equal('created_by' in form, false);
  assert.equal('is_archived' in form, false);
  assert.equal('id' in form, false);
});

// --- trim de name -------------------------------------------------------------

test('buildClientMutationPayload aplica trim em name', () => {
  const form = { ...createEmptyClientForm(), name: '  Cliente Beta  ', entity_type: 'person', lifecycle_stage: 'lead' };
  const payload = buildClientMutationPayload(form);
  assert.equal(payload.name, 'Cliente Beta');
});

// --- textos opcionais vazios -> null -------------------------------------------

test('buildClientMutationPayload converte textos opcionais vazios/espacos para null (convencao ja usada em transactionFormUtils.js)', () => {
  const form = {
    ...createEmptyClientForm(),
    name: 'Cliente Gama',
    primary_contact_name: '   ',
    email: '',
    phone: '',
    document_number: '',
    next_action: '   ',
  };
  const payload = buildClientMutationPayload(form);
  assert.equal(payload.primary_contact_name, null);
  assert.equal(payload.email, null);
  assert.equal(payload.phone, null);
  assert.equal(payload.document_number, null);
  assert.equal(payload.next_action, null);
});

test('buildClientMutationPayload preserva e faz trim de textos opcionais preenchidos', () => {
  const form = {
    ...createEmptyClientForm(),
    name: 'Cliente Delta',
    primary_contact_name: '  Fulano  ',
    email: 'fulano@exemplo.com',
    phone: '11988887777',
    document_number: '12345678900',
    next_action: '  Ligar amanha  ',
  };
  const payload = buildClientMutationPayload(form);
  assert.equal(payload.primary_contact_name, 'Fulano');
  assert.equal(payload.next_action, 'Ligar amanha');
  assert.equal(payload.email, 'fulano@exemplo.com');
});

// --- estimated_value vazio -> 0 -------------------------------------------------

test('buildClientMutationPayload converte estimated_value vazio para 0', () => {
  const form = { ...createEmptyClientForm(), name: 'Cliente Epsilon', estimated_value: '' };
  const payload = buildClientMutationPayload(form);
  assert.equal(payload.estimated_value, 0);
});

test('buildClientMutationPayload converte estimated_value preenchido para numero', () => {
  const form = { ...createEmptyClientForm(), name: 'Cliente Zeta', estimated_value: '2500.75' };
  const payload = buildClientMutationPayload(form);
  assert.equal(payload.estimated_value, 2500.75);
});

// --- valor negativo rejeitado / valor nao numerico rejeitado (validateClientForm) --

test('validateClientForm rejeita estimated_value negativo', () => {
  const form = { ...createEmptyClientForm(), name: 'Cliente Eta', estimated_value: '-10' };
  assert.match(validateClientForm(form), /maior ou igual a zero/i);
});

test('validateClientForm rejeita estimated_value nao numerico', () => {
  const form = { ...createEmptyClientForm(), name: 'Cliente Teta', estimated_value: 'abc' };
  assert.match(validateClientForm(form), /maior ou igual a zero/i);
});

test('validateClientForm aceita estimated_value zero e positivo', () => {
  assert.equal(validateClientForm({ ...createEmptyClientForm(), name: 'X', estimated_value: '0' }), null);
  assert.equal(validateClientForm({ ...createEmptyClientForm(), name: 'X', estimated_value: '100' }), null);
});

// --- relationship_status vazio -> null (payload) --------------------------------

test('buildClientMutationPayload converte relationship_status vazio para null', () => {
  const form = { ...createEmptyClientForm(), name: 'Cliente Iota', relationship_status: '' };
  const payload = buildClientMutationPayload(form);
  assert.equal(payload.relationship_status, null);
});

test('buildClientMutationPayload preserva relationship_status valido', () => {
  const form = { ...createEmptyClientForm(), name: 'Cliente Capa', relationship_status: 'waiting_customer' };
  const payload = buildClientMutationPayload(form);
  assert.equal(payload.relationship_status, 'waiting_customer');
});

// --- enums invalidos rejeitados (validateClientForm) ----------------------------

test('validateClientForm rejeita entity_type fora do enum', () => {
  const form = { ...createEmptyClientForm(), name: 'X', entity_type: 'organization' };
  assert.match(validateClientForm(form), /tipo de cliente/i);
});

test('validateClientForm rejeita lifecycle_stage fora do enum', () => {
  const form = { ...createEmptyClientForm(), name: 'X', lifecycle_stage: 'vip' };
  assert.match(validateClientForm(form), /estagio/i);
});

test('validateClientForm rejeita relationship_status fora do enum (nao vazio)', () => {
  const form = { ...createEmptyClientForm(), name: 'X', relationship_status: 'on_hold' };
  assert.match(validateClientForm(form), /condicao operacional/i);
});

test('validateClientForm aceita relationship_status vazio', () => {
  const form = { ...createEmptyClientForm(), name: 'X', relationship_status: '' };
  assert.equal(validateClientForm(form), null);
});

test('validateClientForm rejeita name vazio ou so espacos', () => {
  assert.match(validateClientForm({ ...createEmptyClientForm(), name: '' }), /nome/i);
  assert.match(validateClientForm({ ...createEmptyClientForm(), name: '   ' }), /nome/i);
});

// --- timestamp local valido -> ISO / vazio -> null / invalido rejeitado --------

test('parseDatetimeLocalValue converte "YYYY-MM-DDTHH:mm" local para ISO', () => {
  const iso = parseDatetimeLocalValue('2026-07-21T14:30');
  assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  // Ida e volta: formatar o ISO resultante de volta para local deve reproduzir o mesmo minuto local.
  assert.equal(formatDatetimeLocalValue(iso), '2026-07-21T14:30');
});

test('parseDatetimeLocalValue com valor vazio retorna null', () => {
  assert.equal(parseDatetimeLocalValue(''), null);
  assert.equal(parseDatetimeLocalValue(undefined), null);
});

test('parseDatetimeLocalValue com valor invalido retorna null (nunca Invalid Date)', () => {
  assert.equal(parseDatetimeLocalValue('nao-e-uma-data'), null);
});

test('isValidDatetimeLocalValue: vazio e valido, invalido e invalido, valido e valido', () => {
  assert.equal(isValidDatetimeLocalValue(''), true);
  assert.equal(isValidDatetimeLocalValue('2026-07-21T14:30'), true);
  assert.equal(isValidDatetimeLocalValue('lixo'), false);
});

test('validateClientForm rejeita last_contact_at invalido', () => {
  const form = { ...createEmptyClientForm(), name: 'X', last_contact_at: 'lixo' };
  assert.match(validateClientForm(form), /data do ultimo contato/i);
});

test('validateClientForm aceita last_contact_at vazio ou valido', () => {
  assert.equal(validateClientForm({ ...createEmptyClientForm(), name: 'X', last_contact_at: '' }), null);
  assert.equal(
    validateClientForm({ ...createEmptyClientForm(), name: 'X', last_contact_at: '2026-07-21T14:30' }),
    null,
  );
});

test('formatDatetimeLocalValue com valor ausente/invalido retorna string vazia, nunca "Invalid Date"', () => {
  assert.equal(formatDatetimeLocalValue(null), '');
  assert.equal(formatDatetimeLocalValue(undefined), '');
  assert.equal(formatDatetimeLocalValue('lixo'), '');
});

// --- payload sem campos protegidos ----------------------------------------------

test('buildClientMutationPayload produz somente os 11 campos permitidos, nunca os protegidos', () => {
  const form = {
    ...createEmptyClientForm(),
    name: 'Cliente Lambda',
    entity_type: 'company',
    lifecycle_stage: 'active',
    relationship_status: 'new',
    estimated_value: '999',
    last_contact_at: '2026-07-21T09:00',
  };
  const payload = buildClientMutationPayload(form);

  assert.deepEqual(
    Object.keys(payload).sort(),
    [
      'document_number',
      'email',
      'entity_type',
      'estimated_value',
      'last_contact_at',
      'lifecycle_stage',
      'name',
      'next_action',
      'phone',
      'primary_contact_name',
      'relationship_status',
    ].sort(),
  );

  for (const forbiddenField of [
    'workspace_id',
    'created_by',
    'assigned_user_id',
    'id',
    'created_at',
    'updated_at',
    'is_archived',
  ]) {
    assert.equal(forbiddenField in payload, false, `payload nao deveria conter ${forbiddenField}`);
  }
});

test('buildClientMutationPayload ignora campos estranhos presentes no form (ex.: id/workspace_id injetados)', () => {
  const form = {
    ...createEmptyClientForm(),
    name: 'Cliente Mu',
    id: 'deveria-ser-ignorado',
    workspace_id: 'deveria-ser-ignorado',
    created_by: 'deveria-ser-ignorado',
    assigned_user_id: 'deveria-ser-ignorado',
    is_archived: true,
  };
  const payload = buildClientMutationPayload(form);
  assert.equal('id' in payload, false);
  assert.equal('workspace_id' in payload, false);
  assert.equal('created_by' in payload, false);
  assert.equal('assigned_user_id' in payload, false);
  assert.equal('is_archived' in payload, false);
});

// --- getClientErrorMessage (safelist, mesmo padrao de getFinanceErrorMessage) ---

test('getClientErrorMessage mostra a mensagem real para codigos seguros', () => {
  const message = getClientErrorMessage(
    { code: 'INVALID_CLIENT_REQUEST', message: 'Nome do cliente e obrigatorio.' },
    'fallback',
  );
  assert.equal(message, 'Nome do cliente e obrigatorio.');
});

test('getClientErrorMessage usa fallback para codigos desconhecidos (nunca vaza erro cru)', () => {
  const message = getClientErrorMessage({ code: '23514', message: 'new row violates check constraint' }, 'fallback');
  assert.equal(message, 'fallback');
});

test('getClientErrorMessage sem erro retorna string vazia', () => {
  assert.equal(getClientErrorMessage(null, 'fallback'), '');
});
