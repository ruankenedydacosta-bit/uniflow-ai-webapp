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

  // More specific patterns first

  if (/\b(?:quando\s+(?:vou|vai)|quando\s+concluir|quando\s+atingir)\b/.test(n) && /\b(?:meta|objetivo)\b/.test(n)) {
    return { type: 'goal_completion' };
  }

  if (/\b(?:saldo\s+vai|vai\s+melhorar|vai\s+piorar|vai\s+sobrar|vai\s+faltar)\b/.test(n)) {
    return { type: 'balance_trend' };
  }

  if (/\b(?:projecao|projeca|projetada|futur[ao]|cena[ri]{2}o)\b/.test(n) && /[0-9]+\s*meses/.test(n)) {
    return { type: 'future_projection' };
  }

  if (/\b(?:como\s+estarao|como\s+estara)\b/.test(n) && /[0-9]+\s*meses/.test(n)) {
    return { type: 'future_projection' };
  }

  if (/\b(?:vou\s+conseguir|vai\s+conseguir|consigo|alcancar|atingir|chegar)\b/.test(n) && /\b(?:meta|objetivo)\b/.test(n)) {
    return { type: 'goal_feasibility' };
  }

  if (/\b(?:meta|metas)\b/.test(n) && /\b(?:risco|riscos|atencao|inviavel|atrasada)\b/.test(n)) {
    return { type: 'goal_risk' };
  }

  if (/\b(?:quanto\s+preciso|quanto\s+devo|quanto\s+guardar|preciso\s+guardar|preciso\s+poupar)\b/.test(n)) {
    return { type: 'required_monthly' };
  }

  // General patterns after specific ones

  if (/categoria/.test(n) && /gast/.test(n)) {
    return { type: 'top_category' };
  }

  if (/\bsaldo\b/.test(n) && !/gast/.test(n) && !/entrou/.test(n) && !/receb/.test(n) && !/vai\s/.test(n)) {
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

  if (
    /\b(?:meta|metas|objetivo|objetivos)\b/.test(n)
    && /\b(?:como|qual|quais|ver|mostrar|consultar|listar|tenho|minhas|meus|status|andamento|progresso)\b/.test(n)
  ) {
    return { type: 'goal_overview' };
  }

  if (/\bsaldo\b/.test(n)) {
    return { type: 'balance' };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Blindagem para perguntas sobre futuro financeiro que NÃO batem com nenhum
// tipo suportado acima. Função pura: não calcula projeção, não duplica
// buildFutureProjections, não acessa React/Supabase/LLM — apenas detecta
// intenção semântica de futuro/tendência/continuidade financeira para que o
// chamador NUNCA envie essas perguntas ao LLM (que inventaria números).
//
// Cada padrão exige um sinal financeiro explícito (palavra da lista de
// "dicas") para evitar falso positivo em frases temporais genéricas sem
// relação com dinheiro (ex.: "marcar reunião para o fim do ano"). As duas
// exceções ("continuando assim" + "acontece", e a expressão idiomática
// "ficar no vermelho") já são inerentemente financeiras neste chat e não
// exigem a dica adicional.
const FUTURE_FINANCIAL_HINT =
  /\b(?:dinheiro|financeir\w*|financas?|saldo|renda|receitas?|despesas?|gastos?|poupar|poupanca|economizar|vermelho|ritmo|fluxo)\b/;

const FUTURE_INTENT_PATTERNS = [
  /\bdinheiro\s+vai\s+durar\b/,
  /\bcontinuando\s+assim\b[\s\S]*\bacontece\b/,
  /\bacontece\b[\s\S]*\bcontinuando\s+assim\b/,
  /\bfica(?:r)?\s+no\s+vermelho\b/,
  /\britmo\b[\s\S]*\bsustentavel\b/,
  /\bsustentavel\b[\s\S]*\britmo\b/,
  /\bmelhorando\b[\s\S]*\bpiorando\b/,
  /\bpiorando\b[\s\S]*\bmelhorando\b/,
  /\btendencia\s+financeira\b/,
  /\bcomo\s+estare(?:i|mos)\b/,
];

const SELF_SUFFICIENT_PATTERN_HINTS = ['continuando', 'acontece', 'vermelho'];

export function detectFutureFinancialIntent(text) {
  if (typeof text !== 'string') return false;
  const n = normalize(text);

  for (const pattern of FUTURE_INTENT_PATTERNS) {
    if (!pattern.test(n)) continue;

    const isSelfSufficient = SELF_SUFFICIENT_PATTERN_HINTS.some((hint) => pattern.source.includes(hint));
    if (isSelfSufficient || FUTURE_FINANCIAL_HINT.test(n)) {
      return true;
    }
  }

  return false;
}

// Resposta segura para perguntas com intenção futura detectada, mas sem tipo
// suportado por classifyFinancialQuery. Nunca contém valor, prazo, percentual
// ou probabilidade fabricados; apenas orienta para as capacidades reais já
// existentes (tendência e cenários de 3/6/12 meses).
export function buildFutureSafetyResponse(hasHistory) {
  if (!hasHistory) {
    return 'Eu ainda não tenho histórico suficiente para projetar seu futuro financeiro com segurança. '
      + 'Registre algumas receitas e despesas para que eu consiga calcular uma tendência real.';
  }

  return 'Consigo analisar sua tendência e os cenários calculados com base no seu histórico, mas ainda não '
    + 'tenho um cálculo confiável para essa pergunta específica. Posso mostrar a projeção de 3, 6 ou 12 meses '
    + 'sem inventar valores — é só perguntar, por exemplo, "qual minha projeção para 6 meses?".';
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

export function buildQueryResponse(queryType, ctx, mode, options = {}) {
  const now = new Date();
  const monthName = MONTH_NAMES[now.getMonth()];
  const prefix = mode === 'empresa' ? 'da sua empresa' : '';
  const subject = mode === 'empresa' ? 'sua empresa' : 'você';
  const type = queryType?.type || queryType;

  switch (type) {
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

    case 'future_projection': {
      const { projections } = options;
      if (!projections || !projections.hasHistory) {
        const msg = `${capitalize(subject)} ainda não tem dados financeiros suficientes para gerar projeções. Cadastre receitas e despesas para que eu possa estimar o futuro.`;
        return { text: msg, highlight: null };
      }
      const likely = projections.scenarioProjections?.likely || {};
      const balance = fmtCurrency(likely.projectedBalance ?? projections.currentBalance);
      const monthly = fmtCurrency(likely.monthlyResult ?? projections.netResult);
      const horizon = projections.selectedHorizon || 6;
      const signal = (likely.monthlyResult ?? projections.netResult) >= 0 ? 'positivo' : 'negativo';
      const monthText = horizon === 1 ? 'mês' : 'meses';
      const msg = `💰 Projeção para ${horizon} ${monthText} (cenário provável):\n• Saldo projetado: ${balance}\n• Resultado médio mensal: ${monthly}\n• Tendência: ${signal}\n\n⚠️ Esta é uma estimativa baseada no seu histórico de ${projections.monthsWithData || 0} ${projections.monthsWithData === 1 ? 'mês' : 'meses'}. Resultados reais podem variar.`;
      return { text: msg, highlight: balance };
    }

    case 'goal_feasibility': {
      const { goalProjections } = options;
      if (!goalProjections || goalProjections.length === 0) {
        const msg = `${capitalize(subject)} não tem metas ativas para avaliar. Crie uma meta em Objetivos para que eu possa analisar a viabilidade.`;
        return { text: msg, highlight: null };
      }
      const lines = goalProjections.map((g) => {
        const label = g.feasibility === 'viable' ? '✅ Viável' : g.feasibility === 'attention' ? '⚠️ Atenção' : '❌ Inviável';
        const extra = g.estimatedMonths ? `(~${g.estimatedMonths} ${g.estimatedMonths === 1 ? 'mês' : 'meses'})` : '';
        return `• "${g.name}": ${label} ${extra}`;
      });
      const msg = `Análise das suas metas:\n${lines.join('\n')}\n\n⚠️ Esta é uma estimativa baseada no seu fluxo financeiro atual.`;
      return { text: msg, highlight: null };
    }

    case 'goal_risk': {
      const { goalProjections } = options;
      if (!goalProjections || goalProjections.length === 0) {
        const msg = `${capitalize(subject)} não tem metas ativas. Crie uma meta para acompanhar.`;
        return { text: msg, highlight: null };
      }
      const atRisk = goalProjections.filter((g) => g.feasibility !== 'viable');
      if (atRisk.length === 0) {
        const msg = `✅ Boas notícias! Todas as suas metas estão viáveis com o fluxo financeiro atual.`;
        return { text: msg, highlight: null };
      }
      const lines = atRisk.map((g) => {
        const label = g.feasibility === 'attention' ? '⚠️ Atenção' : '❌ Inviável';
        return `• "${g.name}": ${label} — ${g.suggestedAction || 'Revise o valor ou prazo'}`;
      });
      const msg = `${atRisk.length === 1 ? 'Meta' : 'Metas'} em risco:\n${lines.join('\n')}\n\n⚠️ Recomendo revisar essas metas em Objetivos ou ver a projeção completa em Visão de Futuro.`;
      return { text: msg, highlight: null };
    }

    case 'required_monthly': {
      const { goalProjections } = options;
      if (!goalProjections || goalProjections.length === 0) {
        const msg = `${capitalize(subject)} não tem metas ativas. Crie uma meta em Objetivos para calcular quanto guardar por mês.`;
        return { text: msg, highlight: null };
      }
      const lines = goalProjections.map((g) => {
        const needed = g.requiredContribution > 0
          ? fmtCurrency(Math.ceil(g.requiredContribution))
          : g.currentContribution > 0
            ? fmtCurrency(g.currentContribution)
            : 'Não definido';
        return `• "${g.name}": ${needed}/mês`;
      });
      const msg = `Contribuição mensal necessária por meta:\n${lines.join('\n')}\n\n⚠️ Valores estimados com base no seu fluxo financeiro e prazos atuais.`;
      return { text: msg, highlight: null };
    }

    case 'balance_trend': {
      const { projections } = options;
      if (!projections || !projections.hasHistory) {
        const msg = `${capitalize(subject)} ainda não tem dados suficientes para avaliar a tendência. Cadastre transações para que eu possa projetar.`;
        return { text: msg, highlight: null };
      }
      const likely = projections.scenarioProjections?.likely || {};
      const currentBalance = fmtCurrency(projections.currentBalance);
      const futureBalance = fmtCurrency(likely.projectedBalance ?? projections.currentBalance);
      const monthlyNet = projections.netResult || 0;
      const signal = monthlyNet >= 0 ? 'positivo' : 'negativo';
      const direction = monthlyNet >= 0 ? 'melhorar' : 'piorar';
      const msg = `📈 Tendência para o saldo:\n• Saldo atual: ${currentBalance}\n• Resultado médio mensal: ${fmtCurrency(monthlyNet)} (${signal})\n• Projeção em ${projections.selectedHorizon || 6} meses: ${futureBalance}\n\nSeu saldo tende a ${direction} com base no histórico atual. ⚠️ Esta é uma estimativa.`;
      return { text: msg, highlight: futureBalance };
    }

    case 'goal_completion': {
      const { goalProjections } = options;
      if (!goalProjections || goalProjections.length === 0) {
        const msg = `${capitalize(subject)} não tem metas ativas. Crie uma meta para acompanhar o progresso.`;
        return { text: msg, highlight: null };
      }
      const lines = goalProjections.map((g) => {
        if (g.status === 'completed') return `• "${g.name}": ✅ Já concluída`;
        if (!g.estimatedMonths) return `• "${g.name}": ❌ Inviável com o fluxo atual`;
        const dateStr = g.estimatedDate ? new Date(g.estimatedDate).toLocaleDateString('pt-BR') : '—';
        return `• "${g.name}": ~${g.estimatedMonths} ${g.estimatedMonths === 1 ? 'mês' : 'meses'} (previsão: ${dateStr})`;
      });
      const msg = `Previsão de conclusão das metas:\n${lines.join('\n')}\n\n⚠️ Estimativa baseada no fluxo atual. Resultados reais podem variar.`;
      return { text: msg, highlight: null };
    }

    case 'goal_overview': {
      const goals = (options.goals ?? []).filter(
        (goal) => goal.archived_at == null && goal.status !== 'canceled',
      );
      if (!goals.length) {
        return {
          text: `${capitalize(subject)} ainda não tem objetivos financeiros ativos.`,
          highlight: null,
        };
      }
      const lines = goals.slice(0, 3).map((goal) => {
        const current = fmtCurrency(Number(goal.current_amount) || 0);
        const target = fmtCurrency(Number(goal.target_amount) || 0);
        return `• "${goal.name}": ${current} de ${target}`;
      });
      return {
        text: `Seus objetivos financeiros ativos:\n${lines.join('\n')}`,
        highlight: null,
      };
    }

    default:
      return null;
  }
}
