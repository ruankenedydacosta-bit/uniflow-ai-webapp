export const conversationMessages = [
  {
    id: 'uni-month',
    role: 'uni',
    content: 'Analisei seu mês e encontrei um cenário saudável, com uma atenção importante: as despesas variáveis cresceram mais rápido que as receitas nos últimos dias.',
  },
  {
    id: 'user-cashflow',
    role: 'user',
    content: 'Como posso melhorar meu fluxo de caixa sem cortar algo importante agora?',
  },
  {
    id: 'uni-guidance',
    role: 'uni',
    content: 'Um bom primeiro passo é revisar os gastos variáveis desta semana e antecipar as entradas já confirmadas. Eu priorizaria três ações: separar despesas essenciais, adiar gastos não urgentes e registrar os recebíveis dos próximos sete dias.',
  },
];

export const contextItems = [
  {
    label: 'Saldo projetado',
    value: 'R$ 48.200',
    status: 'Saudável',
    variant: 'success',
  },
  {
    label: 'Metas ativas',
    value: '3 metas',
    status: 'Em andamento',
    variant: 'primary',
  },
  {
    label: 'Despesas em atenção',
    value: '2 categorias',
    status: 'Atenção',
    variant: 'warning',
  },
];

export const contextualSuggestions = [
  {
    label: 'Economizar',
    intent: 'economy_week',
    subtitle: 'despesas variáveis',
    description: 'Encontre gastos variáveis que podem ser aliviados sem cortar o essencial.',
    prompt: 'Como posso economizar esta semana?',
  },
  {
    label: 'Fluxo de caixa',
    intent: 'cashflow_explain',
    subtitle: 'saldo e entradas',
    description: 'Entenda entradas, saídas e saldo projetado dos próximos dias.',
    prompt: 'Explique meu fluxo de caixa',
  },
  {
    label: 'Atenção hoje',
    intent: 'today_attention',
    subtitle: 'sinais importantes',
    description: 'Veja sinais financeiros que merecem cuidado antes de virarem urgência.',
    prompt: 'O que merece minha atenção hoje?',
  },
];

export const quickSuggestions = contextualSuggestions.map((suggestion) => suggestion.prompt);
