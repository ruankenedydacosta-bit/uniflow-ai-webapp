import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PROJECT_PRIORITIES,
  PROJECT_PRIORITY_BADGE_VARIANTS,
  PROJECT_PRIORITY_LABELS,
  PROJECT_PRIORITY_OPTIONS,
  PROJECT_STATUSES,
  PROJECT_STATUS_BADGE_VARIANTS,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_OPTIONS,
  buildProjectPayload,
  formatProjectDate,
  getProjectEditValues,
  getProjectErrorMessage,
  getProjectInitialValues,
  validateProjectForm,
} from './projectFormUtils.js';

const BADGE_VARIANTS = new Set(['default', 'primary', 'secondary', 'success', 'warning', 'danger', 'glass', 'outline']);

// --- constantes ---------------------------------------------------------------

test('PROJECT_STATUSES cobre exatamente os 5 valores do enum da migration', () => {
  assert.deepEqual(PROJECT_STATUSES, ['planned', 'active', 'on_hold', 'completed', 'cancelled']);
});

test('PROJECT_STATUS_LABELS cobre os mesmos 5 valores, com rotulos pt-BR aprovados', () => {
  assert.deepEqual(Object.keys(PROJECT_STATUS_LABELS), PROJECT_STATUSES);
  assert.deepEqual(PROJECT_STATUS_LABELS, {
    planned: 'Planejado',
    active: 'Ativo',
    on_hold: 'Em pausa',
    completed: 'Concluído',
    cancelled: 'Cancelado',
  });
});

test('PROJECT_PRIORITIES cobre exatamente os 4 valores do enum da migration', () => {
  assert.deepEqual(PROJECT_PRIORITIES, ['low', 'medium', 'high', 'urgent']);
});

test('PROJECT_PRIORITY_LABELS cobre os mesmos 4 valores, com rotulos pt-BR aprovados', () => {
  assert.deepEqual(Object.keys(PROJECT_PRIORITY_LABELS), PROJECT_PRIORITIES);
  assert.deepEqual(PROJECT_PRIORITY_LABELS, {
    low: 'Baixa',
    medium: 'Média',
    high: 'Alta',
    urgent: 'Urgente',
  });
});

test('PROJECT_STATUS_OPTIONS/PROJECT_PRIORITY_OPTIONS sao derivados dos enums+labels, nunca uma segunda copia hardcoded', () => {
  assert.deepEqual(
    PROJECT_STATUS_OPTIONS,
    PROJECT_STATUSES.map((value) => ({ value, label: PROJECT_STATUS_LABELS[value] })),
  );
  assert.deepEqual(
    PROJECT_PRIORITY_OPTIONS,
    PROJECT_PRIORITIES.map((value) => ({ value, label: PROJECT_PRIORITY_LABELS[value] })),
  );
});

test('variantes de badge de status/prioridade usam somente variantes reais do componente Badge', () => {
  for (const status of PROJECT_STATUSES) {
    assert.ok(BADGE_VARIANTS.has(PROJECT_STATUS_BADGE_VARIANTS[status]), `status ${status}`);
  }
  for (const priority of PROJECT_PRIORITIES) {
    assert.ok(BADGE_VARIANTS.has(PROJECT_PRIORITY_BADGE_VARIANTS[priority]), `priority ${priority}`);
  }
});

// --- valores iniciais -----------------------------------------------------------

test('getProjectInitialValues retorna os defaults aprovados para criacao', () => {
  assert.deepEqual(getProjectInitialValues(), {
    name: '',
    description: '',
    status: 'planned',
    priority: 'medium',
    progress: '0',
    starts_at: '',
    due_at: '',
    client_id: '',
    financial_impact: '',
    next_milestone: '',
  });
});

function makeProject(overrides = {}) {
  return {
    id: 'project-1',
    workspace_id: 'w1',
    name: 'Implantação Mercado Oliveira',
    description: 'Descrição completa',
    status: 'active',
    priority: 'high',
    progress: 72,
    starts_at: '2026-07-01',
    due_at: '2026-08-15',
    client_id: 'client-1',
    assigned_user_id: null,
    financial_impact: 18400.5,
    next_milestone: 'Confirmar pagamento da segunda etapa',
    created_by: 'u1',
    created_at: '2026-07-01T10:00:00.000Z',
    updated_at: '2026-07-01T10:00:00.000Z',
    ...overrides,
  };
}

test('getProjectEditValues mapeia um projeto real, convertendo numeros para string', () => {
  const values = getProjectEditValues(makeProject());

  assert.equal(values.name, 'Implantação Mercado Oliveira');
  assert.equal(values.description, 'Descrição completa');
  assert.equal(values.status, 'active');
  assert.equal(values.priority, 'high');
  assert.equal(values.progress, '72');
  assert.equal(values.starts_at, '2026-07-01');
  assert.equal(values.due_at, '2026-08-15');
  assert.equal(values.client_id, 'client-1');
  assert.equal(values.financial_impact, '18400.5');
  assert.equal(values.next_milestone, 'Confirmar pagamento da segunda etapa');
});

test('getProjectEditValues preserva datas YYYY-MM-DD sem conversao (nunca passa por Date)', () => {
  const values = getProjectEditValues(makeProject({ starts_at: '2026-01-31', due_at: '2026-12-01' }));
  assert.equal(values.starts_at, '2026-01-31');
  assert.equal(values.due_at, '2026-12-01');
});

test('getProjectEditValues: campos nulos/ausentes viram string vazia', () => {
  const values = getProjectEditValues(
    makeProject({
      description: null,
      starts_at: null,
      due_at: null,
      client_id: null,
      financial_impact: null,
      next_milestone: null,
    }),
  );
  assert.equal(values.description, '');
  assert.equal(values.starts_at, '');
  assert.equal(values.due_at, '');
  assert.equal(values.client_id, '');
  assert.equal(values.financial_impact, '');
  assert.equal(values.next_milestone, '');
});

test('getProjectEditValues: progress 0 vira string "0", nao string vazia', () => {
  const values = getProjectEditValues(makeProject({ progress: 0 }));
  assert.equal(values.progress, '0');
});

test('getProjectEditValues: status/priority fora do enum caem no default seguro', () => {
  const values = getProjectEditValues(makeProject({ status: 'algo-invalido', priority: 'algo-invalido' }));
  assert.equal(values.status, 'planned');
  assert.equal(values.priority, 'medium');
});

// --- validacao --------------------------------------------------------------------

function validValues(overrides = {}) {
  return {
    name: 'Implantação Mercado Oliveira',
    description: '',
    status: 'planned',
    priority: 'medium',
    progress: '50',
    starts_at: '',
    due_at: '',
    client_id: '',
    financial_impact: '',
    next_milestone: '',
    ...overrides,
  };
}

test('validateProjectForm: nome vazio e obrigatorio', () => {
  assert.equal(validateProjectForm(validValues({ name: '' })), 'Nome do projeto é obrigatório.');
});

test('validateProjectForm: nome composto apenas por espacos e rejeitado', () => {
  assert.equal(validateProjectForm(validValues({ name: '    ' })), 'Nome do projeto é obrigatório.');
});

test('validateProjectForm: status invalido e rejeitado', () => {
  assert.equal(validateProjectForm(validValues({ status: 'invalido' })), 'Selecione um status válido.');
});

test('validateProjectForm: prioridade invalida e rejeitada', () => {
  assert.equal(validateProjectForm(validValues({ priority: 'invalido' })), 'Selecione uma prioridade válida.');
});

test('validateProjectForm: progresso vazio e rejeitado', () => {
  assert.equal(validateProjectForm(validValues({ progress: '' })), 'Progresso deve ser um número inteiro.');
});

test('validateProjectForm: progresso nao numerico e rejeitado', () => {
  assert.equal(validateProjectForm(validValues({ progress: 'abc' })), 'Progresso deve ser um número inteiro.');
});

test('validateProjectForm: progresso decimal e rejeitado', () => {
  assert.equal(validateProjectForm(validValues({ progress: '50.5' })), 'Progresso deve ser um número inteiro.');
});

test('validateProjectForm: progresso menor que 0 e rejeitado', () => {
  assert.equal(validateProjectForm(validValues({ progress: '-1' })), 'Progresso deve estar entre 0 e 100.');
});

test('validateProjectForm: progresso maior que 100 e rejeitado', () => {
  assert.equal(validateProjectForm(validValues({ progress: '101' })), 'Progresso deve estar entre 0 e 100.');
});

test('validateProjectForm: progresso 0 e 100 sao validos (limites inclusivos)', () => {
  assert.equal(validateProjectForm(validValues({ progress: '0' })), null);
  assert.equal(validateProjectForm(validValues({ progress: '100' })), null);
});

test('validateProjectForm: prazo anterior a data inicial e rejeitado', () => {
  assert.equal(
    validateProjectForm(validValues({ starts_at: '2026-08-15', due_at: '2026-08-01' })),
    'O prazo não pode ser anterior à data de início.',
  );
});

test('validateProjectForm: prazo igual a data inicial e valido', () => {
  assert.equal(
    validateProjectForm(validValues({ starts_at: '2026-08-15', due_at: '2026-08-15' })),
    null,
  );
});

test('validateProjectForm: impacto financeiro nao numerico e rejeitado', () => {
  assert.equal(
    validateProjectForm(validValues({ financial_impact: 'abc' })),
    'Impacto financeiro deve ser um número.',
  );
});

test('validateProjectForm: impacto financeiro negativo e rejeitado', () => {
  assert.equal(
    validateProjectForm(validValues({ financial_impact: '-100' })),
    'Impacto financeiro não pode ser negativo.',
  );
});

test('validateProjectForm: impacto financeiro vazio e valido (campo opcional)', () => {
  assert.equal(validateProjectForm(validValues({ financial_impact: '' })), null);
});

test('validateProjectForm: formulario valido minimo (so nome) retorna null', () => {
  assert.equal(validateProjectForm(validValues()), null);
});

test('validateProjectForm: formulario valido completo retorna null', () => {
  assert.equal(
    validateProjectForm(
      validValues({
        description: 'Descrição',
        status: 'active',
        priority: 'high',
        progress: '72',
        starts_at: '2026-07-01',
        due_at: '2026-08-15',
        client_id: 'client-1',
        financial_impact: '18400.50',
        next_milestone: 'Confirmar pagamento',
      }),
    ),
    null,
  );
});

// --- payload ------------------------------------------------------------------

test('buildProjectPayload: trim em nome, descricao e proximo marco', () => {
  const payload = buildProjectPayload(
    validValues({
      name: '  Implantação Mercado Oliveira  ',
      description: '  Descrição  ',
      next_milestone: '  Confirmar pagamento  ',
    }),
  );
  assert.equal(payload.name, 'Implantação Mercado Oliveira');
  assert.equal(payload.description, 'Descrição');
  assert.equal(payload.next_milestone, 'Confirmar pagamento');
});

test('buildProjectPayload: opcionais vazios viram null', () => {
  const payload = buildProjectPayload(validValues());
  assert.equal(payload.description, null);
  assert.equal(payload.starts_at, null);
  assert.equal(payload.due_at, null);
  assert.equal(payload.client_id, null);
  assert.equal(payload.financial_impact, null);
  assert.equal(payload.next_milestone, null);
});

test('buildProjectPayload: progresso vira numero', () => {
  const payload = buildProjectPayload(validValues({ progress: '72' }));
  assert.equal(payload.progress, 72);
  assert.equal(typeof payload.progress, 'number');
});

test('buildProjectPayload: impacto financeiro vira numero quando informado, null quando vazio', () => {
  assert.equal(buildProjectPayload(validValues({ financial_impact: '18400.5' })).financial_impact, 18400.5);
  assert.equal(buildProjectPayload(validValues({ financial_impact: '' })).financial_impact, null);
});

test('buildProjectPayload: datas permanecem strings YYYY-MM-DD, nunca objetos Date', () => {
  const payload = buildProjectPayload(validValues({ starts_at: '2026-07-01', due_at: '2026-08-15' }));
  assert.equal(payload.starts_at, '2026-07-01');
  assert.equal(payload.due_at, '2026-08-15');
  assert.equal(typeof payload.starts_at, 'string');
  assert.equal(typeof payload.due_at, 'string');
});

test('buildProjectPayload: client_id vazio vira null', () => {
  assert.equal(buildProjectPayload(validValues({ client_id: '' })).client_id, null);
});

test('buildProjectPayload: nunca inclui campos imutaveis (id, workspace_id, created_by, timestamps)', () => {
  const payload = buildProjectPayload(validValues());
  assert.equal('id' in payload, false);
  assert.equal('workspace_id' in payload, false);
  assert.equal('created_by' in payload, false);
  assert.equal('created_at' in payload, false);
  assert.equal('updated_at' in payload, false);
});

test('buildProjectPayload: nenhum campo desconhecido e copiado -- lista fechada exata', () => {
  const payload = buildProjectPayload(validValues());
  assert.deepEqual(Object.keys(payload).sort(), [
    'client_id',
    'description',
    'due_at',
    'financial_impact',
    'name',
    'next_milestone',
    'priority',
    'progress',
    'starts_at',
    'status',
  ]);
});

// --- datas ------------------------------------------------------------------------

test('formatProjectDate: formata YYYY-MM-DD valido em pt-BR', () => {
  assert.equal(formatProjectDate('2026-07-22'), '22/07/2026');
});

test('formatProjectDate: null/vazio/invalido retornam string vazia', () => {
  assert.equal(formatProjectDate(null), '');
  assert.equal(formatProjectDate(''), '');
  assert.equal(formatProjectDate('nao-e-uma-data'), '');
});

test('formatProjectDate: nao desloca o dia (constroi Date local, nunca via new Date(string) direto)', () => {
  // 2026-01-01 e o caso mais sensivel a deslocamento por fuso (virada de ano).
  assert.equal(formatProjectDate('2026-01-01'), '01/01/2026');
  assert.equal(formatProjectDate('2026-12-31'), '31/12/2026');
});

// --- erros --------------------------------------------------------------------------

test('getProjectErrorMessage: sem erro retorna string vazia', () => {
  assert.equal(getProjectErrorMessage(null, 'fallback'), '');
});

test('getProjectErrorMessage: codigos seguros retornam a mensagem original', () => {
  assert.equal(
    getProjectErrorMessage({ code: 'INVALID_PROJECT_REQUEST', message: 'Nome do projeto é obrigatório.' }, 'fallback'),
    'Nome do projeto é obrigatório.',
  );
  assert.equal(
    getProjectErrorMessage({ code: 'PROJECT_NOT_FOUND', message: 'Projeto nao encontrado.' }, 'fallback'),
    'Projeto nao encontrado.',
  );
});

test('getProjectErrorMessage: erro cru de cliente de outro workspace vira mensagem amigavel', () => {
  assert.equal(
    getProjectErrorMessage({ code: '23514', message: 'projects: client belongs to a different workspace' }, 'fallback'),
    'Cliente não pertence a este espaço de trabalho. Atualize a página e tente novamente.',
  );
});

test('getProjectErrorMessage: aceita objeto simples com message e usa fallback quando desconhecido', () => {
  assert.equal(
    getProjectErrorMessage({ message: 'algum erro interno de banco' }, 'Não foi possível salvar o projeto.'),
    'Não foi possível salvar o projeto.',
  );
});

test('getProjectErrorMessage: nunca retorna a mensagem crua de um erro desconhecido', () => {
  const message = getProjectErrorMessage(
    { code: '42P01', message: 'relation "projects" does not exist' },
    'Não foi possível criar o projeto. Tente novamente.',
  );
  assert.equal(message, 'Não foi possível criar o projeto. Tente novamente.');
  assert.notEqual(message, 'relation "projects" does not exist');
});
