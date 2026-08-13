// Uni Engine — Fase 21: Tool Calling — narrativa da resposta final.
//
// Converte um ToolResult (interno, com `data` real) em texto natural em
// português — o único formato que pode sair para o usuário. Esta é a etapa
// "Tool Result → Narrativa → Resposta final" do fluxo desenhado na Fase
// 20.1. Consome a estrutura crua do dispatcher/executor (NUNCA o pipeline
// sanitizado da Fase 20.1, que descarta `data` de propósito para telemetria
// e outros consumidores) — este módulo é o único lugar autorizado a ler
// `result.data` para produzir uma frase; ele nunca repassa esse objeto
// adiante, nunca inclui JSON, IDs internos ou metadados na saída.
//
// Garantias:
//   - só narra ToolResult com status 'completed' e executed === true;
//   - só narra quando o handler reportou sucesso (envelope.ok === true);
//   - ferramenta desconhecida ou envelope malformado → null (sem narrativa,
//     o chamador preserva o texto legado);
//   - saída é sempre uma string, nunca um objeto.
const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function fmtCurrency(value) {
  return BRL_FORMATTER.format(Number.isFinite(value) ? value : 0);
}

function joinLines(lines, conversationStyle) {
  const filtered = lines.filter((line) => typeof line === 'string' && line.trim() !== '');
  if (filtered.length === 0) return null;
  if (conversationStyle === 'simple' || filtered.length === 1) {
    return filtered.join(' ');
  }
  return filtered.join('\n');
}

function buildSummaryText(data, conversationStyle) {
  if (!data || typeof data !== 'object') return null;
  const lines = [
    `No período de ${data.period ?? 'referência'}, o resultado foi de ${fmtCurrency(data.result)} (entradas de ${fmtCurrency(data.income)} e saídas de ${fmtCurrency(data.expenses)}).`,
  ];
  if (data.balance !== null && data.balance !== undefined) {
    lines.push(`Seu saldo atual é de ${fmtCurrency(data.balance)}.`);
  }
  return joinLines(lines, conversationStyle);
}

function buildBreakdownText(data, conversationStyle) {
  if (!data || typeof data !== 'object') return null;
  const lines = [`Suas saídas de ${data.period ?? 'referência'} somam ${fmtCurrency(data.total)}.`];
  if (data.categoriesAvailable && Array.isArray(data.byCategory) && data.byCategory.length > 0) {
    const top = [...data.byCategory]
      .sort((a, b) => (b.spent ?? 0) - (a.spent ?? 0))
      .slice(0, 5)
      .map((entry) => `${entry.name}: ${fmtCurrency(entry.spent)}`);
    lines.push(`Por categoria: ${top.join(', ')}.`);
  }
  return joinLines(lines, conversationStyle);
}

function buildCompareText(data, conversationStyle) {
  if (!data || typeof data !== 'object' || data.status !== 'executed' || !data.detail) return null;
  const { interpretation } = data.detail;
  const lines = [
    `Comparando ${data.periodA} com ${data.periodB}${typeof interpretation === 'string' && interpretation ? `: ${interpretation}` : '.'}`,
  ];
  return joinLines(lines, conversationStyle);
}

function buildGoalsText(data, conversationStyle) {
  if (!data || typeof data !== 'object') return null;
  if (!Array.isArray(data.goals) || data.goals.length === 0) {
    return 'Você ainda não tem metas cadastradas.';
  }
  const lines = [`Você tem ${data.count} meta${data.count === 1 ? '' : 's'}:`];
  const items = data.goals.slice(0, 5).map((goal) => `${goal.name}: ${Math.round(goal.progress ?? 0)}% concluída (faltam ${fmtCurrency(goal.remaining)})`);
  lines.push(items.join('; ') + '.');
  return joinLines(lines, conversationStyle);
}

function buildAccountsText(data, conversationStyle) {
  if (!data || typeof data !== 'object') return null;
  const lines = [];
  if (data.totalBalance !== null && data.totalBalance !== undefined) {
    lines.push(`O saldo total das suas contas é de ${fmtCurrency(data.totalBalance)}.`);
  } else {
    lines.push('Você ainda não tem contas cadastradas.');
  }
  if (Array.isArray(data.accounts) && data.accounts.length > 0) {
    lines.push(`São ${data.counts?.accounts ?? data.accounts.length} conta(s).`);
  }
  return joinLines(lines, conversationStyle);
}

function buildRecurringText(data, conversationStyle) {
  if (!data || typeof data !== 'object') return null;
  if (!data.patternSufficient || !Array.isArray(data.detected) || data.detected.length === 0) {
    return 'Não identifiquei saídas recorrentes com padrão suficiente ainda.';
  }
  const lines = [`Identifiquei ${data.detected.length} saída(s) recorrente(s):`];
  const items = data.detected.slice(0, 5).map((item) => `${item.description ?? 'saída'} (${fmtCurrency(item.amount)})`);
  lines.push(items.join('; ') + '.');
  return joinLines(lines, conversationStyle);
}

const NARRATIVE_BUILDERS = {
  get_financial_summary: buildSummaryText,
  get_expense_breakdown: buildBreakdownText,
  compare_financial_periods: buildCompareText,
  get_goal_progress: buildGoalsText,
  get_account_summary: buildAccountsText,
  get_recurring_expenses: buildRecurringText,
};

// Único ponto de entrada: recebe o ToolResult cru (com `data`) já produzido
// pelo dispatcher/executor e devolve uma string pronta para o usuário, ou
// `null` quando não há nada para narrar (o chamador preserva o texto legado).
export function buildToolResultNarrativeText(result, { conversationStyle = 'simple' } = {}) {
  if (!result || typeof result !== 'object') return null;
  if (result.status !== 'completed' || result.executed !== true) return null;
  const envelope = result.data;
  if (!envelope || typeof envelope !== 'object' || envelope.ok !== true) return null;
  const toolName = typeof envelope.tool === 'string' ? envelope.tool : result.toolName;
  const builder = NARRATIVE_BUILDERS[toolName];
  if (typeof builder !== 'function') return null;
  const text = builder(envelope.data, conversationStyle);
  return typeof text === 'string' && text.trim() !== '' ? text : null;
}
