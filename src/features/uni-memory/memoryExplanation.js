export function explainMemoryEvidence(type, evidence = {}) {
  switch (type) {
    case 'recurring_income':
    case 'recurring_expense':
      return `Percebi esse padrão porque ocorreram ${evidence.occurrences ?? 'alguns'} lançamentos semelhantes, na mesma categoria, com aproximadamente ${evidence.averageIntervalDays ?? 'poucos'} dias de intervalo.`;
    case 'category_preference':
      return `Essa categoria apareceu ${evidence.count ?? 'várias'} vezes no período analisado e foi uma das mais frequentes.`;
    case 'account_preference':
      return `Essa conta foi usada em ${evidence.count ?? 'vários'} lançamentos do período analisado.`;
    case 'merchant_category_mapping':
      return 'Essa associação veio de uma correção de categoria feita explicitamente por você.';
    case 'spending_pattern':
      if (evidence.changePercent !== undefined) {
        const direction = evidence.changePercent >= 0 ? 'aumento' : 'redução';
        return `Identifiquei ${direction} de ${Math.abs(evidence.changePercent)}% ao comparar dois períodos equivalentes.`;
      }
      return 'Esse padrão foi identificado pela concentração e frequência dos lançamentos no período.';
    case 'financial_goal_context':
      return 'Esse contexto foi informado durante a conversa e permanece temporário até ser confirmado ou expirar.';
    case 'conversation_preference':
      return 'Essa preferência foi informada explicitamente por você durante a conversa.';
    default:
      return 'Essa informação foi construída a partir de evidências financeiras identificáveis.';
  }
}

export function explainAnomaly(anomaly = {}) {
  switch (anomaly.type) {
    case 'amount_above_category_average':
      return `Este valor ficou acima da média disponível para a categoria, calculada com ${anomaly.evidence?.baselineCount ?? 'outros'} lançamentos anteriores.`;
    case 'probable_duplicate':
      return 'Encontrei dois lançamentos com descrição, valor, conta e data muito próximos. Vale apenas conferir se ambos são esperados.';
    case 'unusual_account_for_description':
      return 'Esta descrição costuma aparecer em outra conta no histórico disponível. Pode ser uma mudança válida; vale apenas confirmar.';
    default:
      return 'Este lançamento ficou diferente do padrão financeiro disponível, sem indicar por si só um problema.';
  }
}
