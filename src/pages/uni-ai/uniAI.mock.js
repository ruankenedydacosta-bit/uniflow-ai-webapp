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

export const quickSuggestions = [
  'Como posso economizar esta semana?',
  'Minha reserva está saudável?',
  'O que devo priorizar agora?',
  'Explique meu fluxo de caixa',
];
