// Como o card de confirmação da Uni se apresenta no redesign (épico #91,
// "Card de rascunho"): tipo no topo, categoria como etiqueta, valor em
// destaque e o resto numa grade rótulo/valor. Puro: lê o mesmo `data` que
// buildConfirmationFromAction e os cards de criação de conta e categoria já
// montam, sem mudar o contrato.

const TRANSACTION_KINDS = new Set(['expense', 'income', 'transfer', 'adjustment']);

function isTransactionCard(data) {
  return TRANSACTION_KINDS.has(data?.actionKind);
}

function resolveBaseKind(data, typeRow) {
  if (data.actionKind === 'adjustment') return 'Ajuste de saldo';
  if (typeRow?.value) return typeRow.value;
  return data.title ?? '';
}

export function resolveConfirmationCard(data) {
  if (!data) return null;
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const status = data.status ?? 'pending';
  const isTransaction = isTransactionCard(data);

  if (data.actionKind === 'edit_transaction') {
    return {
      kind: status === 'pending' ? 'Alteração · rascunho' : 'Alteração',
      tag: null,
      amount: null,
      amountLabel: null,
      details: rows,
    };
  }

  if (!isTransaction) {
    return {
      kind: data.title ?? '',
      tag: null,
      amount: null,
      amountLabel: null,
      details: rows,
    };
  }

  const typeRow = rows.find((row) => row.key === 'type') ?? null;
  const categoryRow = rows.find((row) => row.key === 'category') ?? null;
  const amountRow = rows.find((row) => row.emphasis) ?? null;
  const baseKind = resolveBaseKind(data, typeRow);

  return {
    kind: status === 'pending' ? `${baseKind} · rascunho` : baseKind,
    tag: categoryRow?.value || null,
    amount: amountRow?.value || null,
    // "Valor" é o padrão e fica implícito. Outro rótulo (Novo saldo) aparece
    // em cima do número, senão ele fica ambíguo.
    amountLabel: amountRow && amountRow.label !== 'Valor' ? amountRow.label : null,
    details: rows.filter((row) => row !== typeRow && row !== categoryRow && row !== amountRow),
  };
}
