import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOpportunityCreationPayload,
  buildOpportunityUpdatePayload,
  createEmptyOpportunityForm,
  createOpportunityEditForm,
  getOpportunityCreationErrorMessage,
  getOpportunityErrorMessage,
  getOpportunityMoveErrorMessage,
  validateOpportunityForm,
} from './opportunityFormUtils.js';

// --- 1. formulario vazio -----------------------------------------------------

test('createEmptyOpportunityForm retorna os 4 campos do formulario, com defaults seguros', () => {
  const form = createEmptyOpportunityForm();
  assert.deepEqual(form, {
    title: '',
    client_id: '',
    stage_id: '',
    estimated_value: '',
  });
});

// --- 2. formulario de edicao --------------------------------------------------

test('createOpportunityEditForm mapeia uma oportunidade real, incluindo estimated_value ausente -> "0"', () => {
  const opportunity = {
    id: 'o1',
    workspace_id: 'w1',
    client_id: 'c1',
    stage_id: 's1',
    title: 'Proposta Alfa',
    estimated_value: 1500.5,
    outcome: 'open',
    assigned_user_id: null,
    position: 0,
    created_by: 'u1',
  };

  const form = createOpportunityEditForm(opportunity);

  assert.equal(form.title, 'Proposta Alfa');
  assert.equal(form.client_id, 'c1');
  assert.equal(form.stage_id, 's1');
  assert.equal(form.estimated_value, '1500.5');
});

test('createOpportunityEditForm usa "0" quando estimated_value esta ausente', () => {
  const form = createOpportunityEditForm({ title: 'Sem valor', client_id: 'c1', stage_id: 's1' });
  assert.equal(form.estimated_value, '0');
});

// --- 3. titulo vazio -----------------------------------------------------------

test('validateOpportunityForm rejeita titulo vazio na criacao', () => {
  const form = { ...createEmptyOpportunityForm(), client_id: 'c1', stage_id: 's1' };
  assert.equal(validateOpportunityForm(form, { mode: 'create' }), 'Titulo da oportunidade e obrigatorio.');
});

test('validateOpportunityForm rejeita titulo vazio na edicao', () => {
  const form = { title: '   ', estimated_value: '' };
  assert.equal(validateOpportunityForm(form, { mode: 'edit' }), 'Titulo da oportunidade e obrigatorio.');
});

// --- 4. cliente ausente na criacao ----------------------------------------------

test('validateOpportunityForm rejeita cliente ausente na criacao', () => {
  const form = { title: 'Proposta', client_id: '', stage_id: 's1', estimated_value: '' };
  assert.equal(validateOpportunityForm(form, { mode: 'create' }), 'Cliente e obrigatorio.');
});

// --- 5. etapa ausente na criacao -------------------------------------------------

test('validateOpportunityForm rejeita etapa ausente na criacao', () => {
  const form = { title: 'Proposta', client_id: 'c1', stage_id: '', estimated_value: '' };
  assert.equal(validateOpportunityForm(form, { mode: 'create' }), 'Etapa e obrigatoria.');
});

// --- 6. cliente/etapa nao exigidos na edicao -------------------------------------

test('validateOpportunityForm nao exige cliente nem etapa na edicao', () => {
  const form = { title: 'Proposta', client_id: '', stage_id: '', estimated_value: '' };
  assert.equal(validateOpportunityForm(form, { mode: 'edit' }), null);
});

// --- 7-11. valor estimado ---------------------------------------------------------

test('validateOpportunityForm aceita valor estimado vazio (equivale a zero)', () => {
  const form = { title: 'Proposta', client_id: 'c1', stage_id: 's1', estimated_value: '' };
  assert.equal(validateOpportunityForm(form, { mode: 'create' }), null);
});

test('validateOpportunityForm aceita valor estimado zero', () => {
  const form = { title: 'Proposta', client_id: 'c1', stage_id: 's1', estimated_value: '0' };
  assert.equal(validateOpportunityForm(form, { mode: 'create' }), null);
});

test('validateOpportunityForm aceita valor estimado decimal valido', () => {
  const form = { title: 'Proposta', client_id: 'c1', stage_id: 's1', estimated_value: '1500.75' };
  assert.equal(validateOpportunityForm(form, { mode: 'create' }), null);
});

test('validateOpportunityForm rejeita valor estimado negativo', () => {
  const form = { title: 'Proposta', client_id: 'c1', stage_id: 's1', estimated_value: '-1' };
  assert.equal(
    validateOpportunityForm(form, { mode: 'create' }),
    'Valor estimado deve ser um numero maior ou igual a zero.',
  );
});

test('validateOpportunityForm rejeita valor estimado nao numerico', () => {
  const form = { title: 'Proposta', client_id: 'c1', stage_id: 's1', estimated_value: 'abc' };
  assert.equal(
    validateOpportunityForm(form, { mode: 'create' }),
    'Valor estimado deve ser um numero maior ou igual a zero.',
  );
});

// --- 12. payload de criacao --------------------------------------------------------

test('buildOpportunityCreationPayload monta o payload de criacao com os campos exatos', () => {
  const form = {
    title: '  Proposta Alfa  ',
    client_id: 'c1',
    stage_id: 's1',
    estimated_value: '1500.5',
  };

  const payload = buildOpportunityCreationPayload(form);

  assert.deepEqual(payload, {
    title: 'Proposta Alfa',
    client_id: 'c1',
    stage_id: 's1',
    estimated_value: 1500.5,
  });
});

test('buildOpportunityCreationPayload converte valor estimado vazio para zero', () => {
  const form = { title: 'Proposta', client_id: 'c1', stage_id: 's1', estimated_value: '' };
  const payload = buildOpportunityCreationPayload(form);
  assert.equal(payload.estimated_value, 0);
});

// --- 13. payload de edicao -----------------------------------------------------------

test('buildOpportunityUpdatePayload monta o payload de edicao com os campos exatos', () => {
  const form = {
    title: '  Proposta Alfa Editada  ',
    client_id: 'c1',
    stage_id: 's1',
    estimated_value: '2000',
  };

  const payload = buildOpportunityUpdatePayload(form);

  assert.deepEqual(payload, {
    title: 'Proposta Alfa Editada',
    estimated_value: 2000,
  });
});

// --- 14. exclusao de campos protegidos -------------------------------------------------

test('buildOpportunityCreationPayload nunca inclui campos protegidos', () => {
  const form = {
    title: 'Proposta',
    client_id: 'c1',
    stage_id: 's1',
    estimated_value: '100',
    workspace_id: 'w1',
    outcome: 'won',
    stage_entered_at: '2026-07-21T00:00:00.000Z',
    assigned_user_id: 'u1',
    position: 5,
    created_by: 'u1',
    created_at: '2026-07-21T00:00:00.000Z',
    updated_at: '2026-07-21T00:00:00.000Z',
    id: 'o1',
  };

  const payload = buildOpportunityCreationPayload(form);

  assert.deepEqual(Object.keys(payload).sort(), [
    'client_id',
    'estimated_value',
    'stage_id',
    'title',
  ]);
});

test('buildOpportunityUpdatePayload nunca inclui campos protegidos', () => {
  const form = {
    title: 'Proposta',
    client_id: 'c1',
    stage_id: 's1',
    estimated_value: '100',
    workspace_id: 'w1',
    outcome: 'won',
    stage_entered_at: '2026-07-21T00:00:00.000Z',
    assigned_user_id: 'u1',
    position: 5,
    created_by: 'u1',
    created_at: '2026-07-21T00:00:00.000Z',
    updated_at: '2026-07-21T00:00:00.000Z',
    id: 'o1',
  };

  const payload = buildOpportunityUpdatePayload(form);

  assert.deepEqual(Object.keys(payload).sort(), ['estimated_value', 'title']);
});

// --- 15. client_id/stage_id nunca no payload de edicao ------------------------------

test('buildOpportunityUpdatePayload nunca inclui client_id nem stage_id, mesmo presentes no form', () => {
  const form = { title: 'Proposta', client_id: 'c1', stage_id: 's1', estimated_value: '100' };
  const payload = buildOpportunityUpdatePayload(form);
  assert.equal('client_id' in payload, false);
  assert.equal('stage_id' in payload, false);
});

// --- mensagens de erro seguras -----------------------------------------------------

test('getOpportunityErrorMessage expoe apenas mensagens de codigos seguros', () => {
  assert.equal(
    getOpportunityErrorMessage({ code: 'INVALID_OPPORTUNITY_REQUEST', message: 'msg' }, 'fallback'),
    'msg',
  );
  assert.equal(
    getOpportunityErrorMessage({ code: 'UNKNOWN', message: 'msg interna' }, 'fallback'),
    'fallback',
  );
  assert.equal(getOpportunityErrorMessage(null, 'fallback'), '');
});

// --- getOpportunityCreationErrorMessage -----------------------------------------------

test('getOpportunityCreationErrorMessage reaproveita os codigos seguros de getOpportunityErrorMessage', () => {
  assert.equal(
    getOpportunityCreationErrorMessage(
      { code: 'INVALID_OPPORTUNITY_REQUEST', message: 'Titulo obrigatorio.' },
      'fallback',
    ),
    'Titulo obrigatorio.',
  );
});

test('getOpportunityCreationErrorMessage mapeia cliente arquivado para mensagem fixa', () => {
  const error = {
    code: '23514',
    message: 'crm_opportunities: cannot create an opportunity for an archived client',
  };
  assert.equal(
    getOpportunityCreationErrorMessage(error, 'fallback'),
    'Este cliente está arquivado. Reative-o ou escolha outro cliente.',
  );
});

test('getOpportunityCreationErrorMessage mapeia etapa arquivada (criacao) para mensagem fixa', () => {
  const error = {
    code: '23514',
    message: 'crm_opportunities: cannot create an opportunity in an archived stage',
  };
  assert.equal(
    getOpportunityCreationErrorMessage(error, 'fallback'),
    'Esta etapa está arquivada. Escolha outra etapa.',
  );
});

test('getOpportunityCreationErrorMessage mapeia etapa arquivada (movimentacao) para mensagem fixa', () => {
  const error = {
    code: '23514',
    message: 'crm_opportunities: cannot move an opportunity into an archived stage',
  };
  assert.equal(
    getOpportunityCreationErrorMessage(error, 'fallback'),
    'Esta etapa está arquivada. Escolha outra etapa.',
  );
});

test('getOpportunityCreationErrorMessage mapeia workspace divergente para mensagem fixa', () => {
  const error = { code: '23514', message: 'crm_opportunities: client belongs to a different workspace' };
  assert.equal(
    getOpportunityCreationErrorMessage(error, 'fallback'),
    'Cliente ou etapa não pertence a este espaço de trabalho. Atualize a página e tente novamente.',
  );
});

test('getOpportunityCreationErrorMessage retorna o fallback para erro desconhecido, nunca a mensagem crua', () => {
  const error = { code: '23505', message: 'duplicate key value violates unique constraint "xyz"' };
  assert.equal(getOpportunityCreationErrorMessage(error, 'fallback'), 'fallback');
});

test('getOpportunityCreationErrorMessage retorna string vazia sem erro', () => {
  assert.equal(getOpportunityCreationErrorMessage(null, 'fallback'), '');
});

// --- getOpportunityMoveErrorMessage -------------------------------------------------

test('getOpportunityMoveErrorMessage mapeia etapa arquivada', () => {
  const error = {
    code: '23514',
    message: 'crm_opportunities: cannot move an opportunity into an archived stage',
  };
  assert.equal(
    getOpportunityMoveErrorMessage(error, 'fallback'),
    'Esta etapa está arquivada. Escolha outra etapa.',
  );
});

test('getOpportunityMoveErrorMessage mapeia workspace divergente', () => {
  const error = {
    code: '23514',
    message: 'crm_opportunities: stage belongs to a different workspace',
  };
  assert.equal(
    getOpportunityMoveErrorMessage(error, 'fallback'),
    'Cliente ou etapa não pertence a este espaço de trabalho. Atualize a página e tente novamente.',
  );
});

test('getOpportunityMoveErrorMessage preserva mensagem segura de OPPORTUNITY_NOT_FOUND', () => {
  const error = { code: 'OPPORTUNITY_NOT_FOUND', message: 'Oportunidade não encontrada.' };
  assert.equal(
    getOpportunityMoveErrorMessage(error, 'fallback'),
    'Oportunidade não encontrada.',
  );
});

test('getOpportunityMoveErrorMessage retorna fallback para erro desconhecido', () => {
  const error = { code: '42501', message: 'permission denied for internal relation' };
  assert.equal(getOpportunityMoveErrorMessage(error, 'fallback seguro'), 'fallback seguro');
});

test('getOpportunityMoveErrorMessage nunca retorna mensagem crua desconhecida', () => {
  const rawMessage = 'duplicate key value exposes internal constraint';
  const result = getOpportunityMoveErrorMessage({ code: '23505', message: rawMessage }, 'fallback');
  assert.notEqual(result, rawMessage);
  assert.equal(result, 'fallback');
});

test('getOpportunityMoveErrorMessage retorna string vazia sem erro', () => {
  assert.equal(getOpportunityMoveErrorMessage(null, 'fallback'), '');
});

test('helper de movimentacao nao altera o contrato do helper de criacao', () => {
  const error = {
    code: '23514',
    message: 'crm_opportunities: cannot create an opportunity for an archived client',
  };
  assert.equal(
    getOpportunityCreationErrorMessage(error, 'fallback'),
    'Este cliente está arquivado. Reative-o ou escolha outro cliente.',
  );
});
