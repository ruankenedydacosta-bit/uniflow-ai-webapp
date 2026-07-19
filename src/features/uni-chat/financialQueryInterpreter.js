const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function classifyFinancialQuery(text) {
  const n = normalize(text);

  if (/categoria/.test(n) && /gast/.test(n)) {
    return { type: 'top_category' };
  }

  if (/\bsaldo\b/.test(n) && !/gast/.test(n) && !/entrou/.test(n) && !/receb/.test(n)) {
    return { type: 'balance' };
  }

  if (/\b(?:entrou|receb|receita|faturei)\b/.test(n) && /\b(?:mes|este|esse)\b/.test(n)) {
    return { type: 'monthly_income' };
  }

  if (/\bgast/.test(n) && /\b(?:mes|este|esse)\b/.test(n)) {
    return { type: 'monthly_expenses' };
  }

  if (/\b(?:como\s+est[ai]|resumo)\b/.test(n) && /\bmes\b/.test(n)) {
    return { type: 'monthly_summary' };
  }

  if ((/\bultim/.test(n) || /\brecent/.test(n)) && (/\btransac/.test(n) || /\bmoviment/.test(n) || /\blancamento/.test(n))) {
    return { type: 'recent_transactions' };
  }

  if (/\bsaldo\b/.test(n)) {
    return { type: 'balance' };
  }

  return null;
}

function fmtCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function fmtShortDate(dateStr) {
  if (!dateStr) return '';
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function buildQueryResponse(queryType, ctx, mode) {
  const now = new Date();
  const monthName = MONTH_NAMES[now.getMonth()];
  const prefix = mode === 'empresa' ? 'da sua empresa' : '';
  const subject = mode === 'empresa' ? 'sua empresa' : 'você';

  switch (queryType) {
    case 'balance': {
      const value = fmtCurrency(ctx.balance);
      const msg = `O saldo atual ${prefix} é ${value}, considerando todas as contas conectadas.`;
      return { text: msg, highlight: value };
    }

    case 'monthly_expenses': {
      const value = fmtCurrency(ctx.monthlyExpense);
      const msg = `Em ${monthName}, ${subject} gastou ${value} em despesas confirmadas.`;
      return { text: msg, highlight: value };
    }

    case 'monthly_income': {
      const value = fmtCurrency(ctx.monthlyIncome);
      const msg = `Em ${monthName}, entraram ${value} em receitas${prefix}.`;
      return { text: msg, highlight: value };
    }

    case 'monthly_summary': {
      const balance = fmtCurrency(ctx.balance);
      const income = fmtCurrency(ctx.monthlyIncome);
      const expense = fmtCurrency(ctx.monthlyExpense);
      const result = fmtCurrency(Math.abs(ctx.result));
      const signal = ctx.result >= 0 ? 'positivo' : 'negativo';
      const expenseLabel = ctx.monthlyExpense > 0
        ? `despesas de ${expense}`
        : 'nenhuma despesa registrada';
      const incomeLabel = ctx.monthlyIncome > 0
        ? `receitas de ${income}`
        : 'nenhuma receita registrada';
      const msg = `Resumo de ${monthName} para ${subject}:\n• Saldo atual: ${balance}\n• ${incomeLabel}\n• ${expenseLabel}\n• Resultado ${signal} de ${result}`;
      return { text: msg, highlight: balance };
    }

    case 'recent_transactions': {
      if (!ctx.recentTransactions.length) {
        const msg = `${capitalize(subject)} ainda não tem transações registradas.`;
        return { text: msg, highlight: null };
      }
      const lines = ctx.recentTransactions.map((tx) => {
        const sign = tx.transaction_type === 'income'
          ? '+'
          : tx.transaction_type === 'expense'
            ? '-'
            : '↔';
        const amount = fmtCurrency(tx.amount);
        const cat = ctx.categoriesById.get(tx.category_id) || 'Sem categoria';
        return `• ${fmtShortDate(tx.transaction_date)} — ${tx.description || cat} — ${sign} ${amount}`;
      });
      const msg = `Últimas transações${prefix}:\n${lines.join('\n')}`;
      return { text: msg, highlight: null };
    }

    case 'top_category': {
      if (!ctx.topCategory) {
        const msg = `${capitalize(subject)} não teve gastos categorizados em ${monthName}.`;
        return { text: msg, highlight: null };
      }
      const value = fmtCurrency(ctx.topCategory.amount);
      const total = fmtCurrency(ctx.monthlyExpense);
      const percent = ctx.monthlyExpense > 0
        ? Math.round((ctx.topCategory.amount / ctx.monthlyExpense) * 100)
        : 0;
      const msg = `Em ${monthName}, a categoria com maior gasto${prefix} foi "${ctx.topCategory.name}", com ${value} — ${percent}% do total de ${total}.`;
      return { text: msg, highlight: value };
    }

    default:
      return null;
  }
}
