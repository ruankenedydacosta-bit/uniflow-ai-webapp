export const ONBOARDING_STEPS = [
  { step: 1, key: 'welcome', label: 'Boas-vindas' },
  { step: 2, key: 'mode', label: 'Modo de uso' },
  { step: 3, key: 'goal', label: 'Objetivo' },
  { step: 4, key: 'financial', label: 'Situação financeira' },
  { step: 5, key: 'tone', label: 'Tom da Uni' },
  { step: 6, key: 'summary', label: 'Resumo' },
];

export const TOTAL_STEPS = ONBOARDING_STEPS.length;

export const MODE_OPTIONS = [
  {
    id: 'personal',
    title: 'Pessoal',
    description: 'Organizar minha vida financeira, definir metas e cuidar das contas do dia a dia.',
    badge: 'PF',
    workspaceType: 'personal',
  },
  {
    id: 'business',
    title: 'Empresa',
    description: 'Gerenciar o caixa, clientes, projetos e decisões do meu negócio.',
    badge: 'PJ',
    workspaceType: 'business',
  },
  {
    id: 'both',
    title: 'Pessoal + Empresa',
    description: 'Separar vida pessoal e empresa sem misturar contas, contexto ou decisões.',
    badge: 'PF + PJ',
    workspaceType: 'business',
  },
];

export const GOAL_OPTIONS = [
  { id: 'organizar', label: 'Organizar minhas finanças' },
  { id: 'dividas', label: 'Sair das dívidas' },
  { id: 'reserva', label: 'Criar reserva de emergência' },
  { id: 'meta', label: 'Economizar para uma meta' },
  { id: 'investir', label: 'Começar a investir' },
  { id: 'empresa', label: 'Melhorar as finanças da empresa' },
  { id: 'outro', label: 'Outro objetivo' },
];

export const INCOME_RANGES = [
  { value: 'ate-1500', label: 'Até R$ 1.500' },
  { value: '1500-3000', label: 'R$ 1.500 a R$ 3.000' },
  { value: '3000-7000', label: 'R$ 3.000 a R$ 7.000' },
  { value: '7000-15000', label: 'R$ 7.000 a R$ 15.000' },
  { value: 'acima-15000', label: 'Acima de R$ 15.000' },
];

export const EXPENSE_RANGES = [
  { value: 'ate-1000', label: 'Até R$ 1.000' },
  { value: '1000-3000', label: 'R$ 1.000 a R$ 3.000' },
  { value: '3000-7000', label: 'R$ 3.000 a R$ 7.000' },
  { value: '7000-15000', label: 'R$ 7.000 a R$ 15.000' },
  { value: 'acima-15000', label: 'Acima de R$ 15.000' },
];

export const BUSINESS_TYPES = [
  { value: 'mei', label: 'MEI' },
  { value: 'pequena', label: 'Pequena empresa' },
  { value: 'autonomo', label: 'Autônomo / Freelancer' },
  { value: 'outro', label: 'Outro' },
];

export const REVENUE_RANGES = [
  { value: 'ate-5000', label: 'Até R$ 5.000/mês' },
  { value: '5000-20000', label: 'R$ 5.000 a R$ 20.000/mês' },
  { value: '20000-100000', label: 'R$ 20.000 a R$ 100.000/mês' },
  { value: 'acima-100000', label: 'Acima de R$ 100.000/mês' },
];

export const TONE_OPTIONS = [
  {
    id: 'direct',
    title: 'Direta e objetiva',
    description: 'Vai direto ao ponto com respostas curtas e práticas. Ideal para quem quer eficiência.',
  },
  {
    id: 'warm',
    title: 'Acolhedora e parceira',
    description: 'Conversa natural e motivadora que acolhe sem julgamento. Como uma amiga que entende de finanças.',
  },
  {
    id: 'strategic',
    title: 'Estratégica e sofisticada',
    description: 'Análise aprofundada com visão de longo prazo. Para quem gosta de dados e consistência.',
  },
];

export const INITIAL_ONBOARDING_DATA = {
  mode: null,
  goal: null,
  goalText: '',
  financialProfile: {},
  userTone: null,
};
