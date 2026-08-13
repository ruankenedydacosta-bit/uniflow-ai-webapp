import { nextMessageId } from './messageIdRegistry.js';

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
    id: nextMessageId(),
    from: 'user',
    type: 'text',
    text,
    time: now(),
  };
}

export function buildUniMessage(text, options = {}) {
  return {
    id: options.id || nextMessageId(),
    from: 'uni',
    type: options.type || 'text',
    text,
    time: now(),
    ...(options.highlight ? { highlight: options.highlight } : {}),
    ...(options.confirmation ? { confirmation: options.confirmation } : {}),
  };
}

function formatSignedCurrency(amount) {
  if (amount == null) return '';
  const value = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Math.abs(amount));
  return `${amount < 0 ? '-' : '+'}${value}`;
}

function resolvePublicTypeLabel(action) {
  if (action?.transactionType === 'income') return 'Entrada';
  if (action?.transactionType === 'expense') return 'Saída';
  return action?.typeLabel || null;
}

export function buildConfirmationFromAction(action) {
  if (!action) return null;

  const rows = [];
  const isBalanceAdjustment = action.balanceTarget != null && action.transactionType === 'adjustment';
  const isTransfer = action.transactionType === 'transfer';
  const publicTypeLabel = resolvePublicTypeLabel(action);

  // BUG REAL (BUG 5): cada linha tem key estável semântica -- labels se
  // repetem (transferência mostra duas linhas de conta) e key={label}
  // duplicava a chave React ("Conta").
  if (publicTypeLabel) {
    rows.push({ key: 'type', label: 'Tipo', value: publicTypeLabel });
  }
  if (action.account?.name) {
    rows.push({
      key: 'account',
      label: isTransfer ? 'Conta de origem' : 'Conta',
      value: action.account.name,
    });
  }
  if (isTransfer && action.destinationAccount?.name) {
    rows.push({ key: 'destination-account', label: 'Conta de destino', value: action.destinationAccount.name });
  }
  if (isBalanceAdjustment) {
    if (action.currentBalance != null) {
      rows.push({ key: 'current-balance', label: 'Saldo atual', value: formatCurrency(action.currentBalance) });
    }
    if (action.balanceDelta != null) {
      rows.push({ key: 'adjustment', label: 'Ajuste', value: formatSignedCurrency(action.balanceDelta) });
    }
    if (action.balanceTarget != null) {
      rows.push({ key: 'new-balance', label: 'Novo saldo', value: formatCurrency(action.balanceTarget), emphasis: true });
    }
  } else {
    if (action.category?.name) {
      rows.push({ key: 'category', label: 'Categoria', value: action.category.name });
    }
    if (action.description) {
      rows.push({ key: 'description', label: 'Descrição', value: action.description });
    }
    if (action.amount != null) {
      rows.push({ key: 'amount', label: 'Valor', value: formatCurrency(action.amount), emphasis: true });
    }
  }
  if (action.date) {
    rows.push({ key: 'date', label: 'Data', value: formatDate(action.date) });
  }

  return {
    title: isBalanceAdjustment
      ? 'Novo ajuste de saldo'
      : `Nova ${(publicTypeLabel || 'movimentação').toLowerCase()}`,
    status: 'pending',
    // FASE ESTADOS DE PROCESSAMENTO: campo aditivo (não usado pelos
    // consumidores existentes de `rows`/`title`/`status`) que identifica o
    // tipo real da ação -- alimenta useUniProcessingMessage('executing', …)
    // para mostrar um rótulo honesto ("Atualizando seu saldo…",
    // "Registrando sua movimentação…" etc.) em vez de um texto genérico.
    actionKind: isBalanceAdjustment ? 'adjustment' : (action.transactionType ?? null),
    rows,
  };
}

export function workspaceTypeToMode(workspaceType) {
  return workspaceType === 'business' ? 'empresa' : 'pessoal';
}

export function modeToWorkspaceType(mode) {
  return mode === 'empresa' ? 'business' : 'personal';
}
