import { nextId } from './mockData';

function now() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatCurrency(amount) {
  if (amount == null) return '';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

export function buildUserMessage(text) {
  return {
    id: nextId(),
    from: 'user',
    type: 'text',
    text,
    time: now(),
  };
}

export function buildUniMessage(text, options = {}) {
  return {
    id: options.id || nextId(),
    from: 'uni',
    type: options.type || 'text',
    text,
    time: now(),
    ...(options.highlight ? { highlight: options.highlight } : {}),
    ...(options.confirmation ? { confirmation: options.confirmation } : {}),
  };
}

export function buildConfirmationFromAction(action, workspaceType = 'personal') {
  if (!action) return null;

  const rows = [];

  if (action.typeLabel) {
    rows.push({ label: 'Tipo', value: action.typeLabel });
  }
  if (action.category?.name) {
    rows.push({ label: 'Categoria', value: action.category.name });
  }
  if (action.description) {
    rows.push({ label: 'Descrição', value: action.description });
  }
  if (action.amount != null) {
    rows.push({ label: 'Valor', value: formatCurrency(action.amount), emphasis: true });
  }
  if (action.date) {
    rows.push({ label: 'Data', value: formatDate(action.date) });
  }
  if (action.account?.name) {
    rows.push({ label: 'Conta', value: action.account.name });
  }
  rows.push({
    label: 'Espaço',
    value: workspaceType === 'business' ? 'Empresa' : 'Pessoal',
  });

  return {
    title: `Nova ${(action.typeLabel || 'movimentação').toLowerCase()}`,
    status: 'pending',
    rows,
  };
}

export function workspaceTypeToMode(workspaceType) {
  return workspaceType === 'business' ? 'empresa' : 'pessoal';
}

export function modeToWorkspaceType(mode) {
  return mode === 'empresa' ? 'business' : 'personal';
}
