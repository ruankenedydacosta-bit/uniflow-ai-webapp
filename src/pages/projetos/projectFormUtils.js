// Logica pura do formulario de projetos: valores iniciais, validacao e
// montagem do payload. Sem dependencia de React/Supabase -- testavel via
// node --test. Mesmo padrao de agendaFormUtils.js/clientFormUtils.js (cada
// dominio duplica sua propria copia, sem compartilhamento entre modulos).
//
// Responsavel (assigned_user_id) permanece fora do formulario nesta fase --
// nao existe hoje service/hook que liste membros ativos de um workspace de
// forma segura (workspaceMembershipService.js so resolve o papel do proprio
// usuario autenticado, nunca a lista de membros). Mesma decisao ja tomada
// para agenda_items.assigned_user_id (ver comentario da coluna na migration
// 20260722_017). O campo continua existindo no modelo/service, pronto para
// uso futuro quando essa infraestrutura existir.

export const PROJECT_STATUSES = Object.freeze([
  'planned',
  'active',
  'on_hold',
  'completed',
  'cancelled',
]);

export const PROJECT_PRIORITIES = Object.freeze(['low', 'medium', 'high', 'urgent']);

export const PROJECT_STATUS_LABELS = Object.freeze({
  planned: 'Planejado',
  active: 'Ativo',
  on_hold: 'Em pausa',
  completed: 'Concluído',
  cancelled: 'Cancelado',
});

export const PROJECT_PRIORITY_LABELS = Object.freeze({
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
});

export const PROJECT_STATUS_BADGE_VARIANTS = Object.freeze({
  planned: 'secondary',
  active: 'success',
  on_hold: 'warning',
  completed: 'outline',
  cancelled: 'danger',
});

export const PROJECT_PRIORITY_BADGE_VARIANTS = Object.freeze({
  low: 'outline',
  medium: 'secondary',
  high: 'warning',
  urgent: 'danger',
});

export const PROJECT_STATUS_OPTIONS = PROJECT_STATUSES.map((value) => ({
  value,
  label: PROJECT_STATUS_LABELS[value],
}));

export const PROJECT_PRIORITY_OPTIONS = PROJECT_PRIORITIES.map((value) => ({
  value,
  label: PROJECT_PRIORITY_LABELS[value],
}));

const SAFE_ERROR_CODES = new Set([
  'INVALID_PROJECT_REQUEST',
  'SUPABASE_NOT_CONFIGURED',
  'PROJECT_NOT_FOUND',
  'PROJECT_MUTATION_IN_PROGRESS',
  'WORKSPACE_REQUIRED',
]);

/**
 * Mensagens fixas para os erros de dominio levantados pelos triggers
 * validate_project_client/validate_project_assigned_user (migration
 * 20260723_018_projects.sql), que chegam como erro cru do Postgrest (codigo
 * fora de SAFE_ERROR_CODES). Casamos por substring fixa e controlada (texto
 * nosso, escrito na propria migration), nunca por regex generica, e nunca
 * retornamos error.message cru quando desconhecido.
 */
const KNOWN_ERROR_PATTERNS = [
  {
    match: 'client belongs to a different workspace',
    message: 'Cliente não pertence a este espaço de trabalho. Atualize a página e tente novamente.',
  },
  {
    match: 'not found or not accessible',
    message: 'Cliente não encontrado ou não pertence mais a este espaço de trabalho.',
  },
];

export function getProjectErrorMessage(error, fallbackMessage) {
  if (!error) return '';

  if (SAFE_ERROR_CODES.has(error.code)) {
    return error.message;
  }

  const knownPattern = KNOWN_ERROR_PATTERNS.find(
    (pattern) => typeof error.message === 'string' && error.message.includes(pattern.match),
  );

  return knownPattern ? knownPattern.message : fallbackMessage;
}

export function getProjectInitialValues() {
  return {
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
  };
}

/** Mapeia um projeto real (vindo de projectsService.js) para o estado do formulario de edicao. null/undefined -> string vazia. */
export function getProjectEditValues(project) {
  return {
    name: project.name ?? '',
    description: project.description ?? '',
    status: PROJECT_STATUSES.includes(project.status) ? project.status : 'planned',
    priority: PROJECT_PRIORITIES.includes(project.priority) ? project.priority : 'medium',
    progress: String(project.progress ?? 0),
    starts_at: project.starts_at ?? '',
    due_at: project.due_at ?? '',
    client_id: project.client_id ?? '',
    financial_impact:
      project.financial_impact === null || project.financial_impact === undefined
        ? ''
        : String(project.financial_impact),
    next_milestone: project.next_milestone ?? '',
  };
}

/**
 * Retorna null quando o formulario e valido, ou uma mensagem de erro (a
 * primeira violacao encontrada) caso contrario. E a barreira real antes da
 * mutacao, nao depende de required/disabled no JSX.
 */
export function validateProjectForm(values) {
  if (!values.name?.trim()) {
    return 'Nome do projeto é obrigatório.';
  }

  if (!PROJECT_STATUSES.includes(values.status)) {
    return 'Selecione um status válido.';
  }

  if (!PROJECT_PRIORITIES.includes(values.priority)) {
    return 'Selecione uma prioridade válida.';
  }

  const progressNumber = Number(values.progress);
  if (
    values.progress === '' ||
    values.progress === null ||
    values.progress === undefined ||
    !Number.isFinite(progressNumber) ||
    !Number.isInteger(progressNumber)
  ) {
    return 'Progresso deve ser um número inteiro.';
  }
  if (progressNumber < 0 || progressNumber > 100) {
    return 'Progresso deve estar entre 0 e 100.';
  }

  if (values.starts_at && values.due_at && values.due_at < values.starts_at) {
    return 'O prazo não pode ser anterior à data de início.';
  }

  if (values.financial_impact !== '' && values.financial_impact !== null && values.financial_impact !== undefined) {
    const financialImpactNumber = Number(values.financial_impact);
    if (!Number.isFinite(financialImpactNumber)) {
      return 'Impacto financeiro deve ser um número.';
    }
    if (financialImpactNumber < 0) {
      return 'Impacto financeiro não pode ser negativo.';
    }
  }

  return null;
}

/**
 * Lista fechada de campos, montada por atribuicao explicita (nunca por
 * spread do form inteiro) -- garante estruturalmente que id, workspace_id,
 * created_by e timestamps jamais sejam produzidos aqui. Mesmo padrao de
 * buildAgendaItemCreationPayload/buildClientMutationPayload.
 * Deve ser chamado somente apos validateProjectForm(values) retornar null.
 */
export function buildProjectPayload(values) {
  return {
    name: values.name.trim(),
    description: values.description?.trim() ? values.description.trim() : null,
    status: values.status,
    priority: values.priority,
    progress: Number(values.progress),
    starts_at: values.starts_at || null,
    due_at: values.due_at || null,
    client_id: values.client_id || null,
    financial_impact:
      values.financial_impact === '' || values.financial_impact === null || values.financial_impact === undefined
        ? null
        : Number(values.financial_impact),
    next_milestone: values.next_milestone?.trim() ? values.next_milestone.trim() : null,
  };
}

/**
 * Formata uma data "YYYY-MM-DD" (coluna `date`, sem horario) em pt-BR sem
 * risco de deslocamento de dia. `new Date('YYYY-MM-DD')` interpreta a
 * string como UTC meia-noite -- em fusos negativos (ex.: Brasil) o
 * Intl.DateTimeFormat local exibiria o dia anterior. Aqui os componentes
 * sao extraidos e um Date local e construido diretamente (mesma tecnica ja
 * usada em AgendaPage.jsx/formatDayLabel).
 */
export function formatProjectDate(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return '';
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR').format(date);
}
