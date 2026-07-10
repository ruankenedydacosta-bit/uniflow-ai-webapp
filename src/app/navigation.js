import { PLANS, USER_MODES } from './access';

const ALL_MODES = [USER_MODES.PERSONAL, USER_MODES.BUSINESS, USER_MODES.BOTH];
const ALL_PLANS = [PLANS.FREE, PLANS.PRO, PLANS.BUSINESS, PLANS.ENTERPRISE];
const BUSINESS_MODES = [USER_MODES.BUSINESS, USER_MODES.BOTH];
const BUSINESS_PLANS = [PLANS.BUSINESS, PLANS.ENTERPRISE];

export const navigationItems = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    modes: ALL_MODES,
    plans: ALL_PLANS,
    description: 'Visão inicial do espaço financeiro ativo.',
  },
  {
    label: 'Uni AI',
    path: '/uni-ai',
    modes: ALL_MODES,
    plans: ALL_PLANS,
    description: 'Consultora financeira inteligente da UniFlow AI.',
  },
  {
    label: 'Financeiro',
    path: '/financeiro',
    modes: ALL_MODES,
    plans: ALL_PLANS,
    description: 'Receitas, despesas, saldo e fluxo financeiro.',
  },
  {
    label: 'CRM',
    path: '/crm',
    modes: BUSINESS_MODES,
    plans: BUSINESS_PLANS,
    description: 'Relacionamento comercial e oportunidades de negócio.',
  },
  {
    label: 'Projetos',
    path: '/projetos',
    modes: BUSINESS_MODES,
    plans: BUSINESS_PLANS,
    description: 'Projetos e entregas ligados ao espaço empresarial.',
  },
  {
    label: 'Agenda',
    path: '/agenda',
    modes: ALL_MODES,
    plans: ALL_PLANS,
    description: 'Compromissos, decisões e eventos financeiros.',
  },
  {
    label: 'Relatórios',
    path: '/relatorios',
    modes: ALL_MODES,
    plans: [PLANS.PRO, PLANS.BUSINESS, PLANS.ENTERPRISE],
    description: 'Leituras e análises do contexto financeiro.',
  },
  {
    label: 'Configurações',
    path: '/configuracoes',
    modes: ALL_MODES,
    plans: ALL_PLANS,
    description: 'Preferências do usuário, espaço e produto.',
  },
];

// O filtro será ativado depois do onboarding/login, quando userMode e plan forem reais.
export function filterNavigationItems(items, { userMode, plan }) {
  return items.filter((item) => item.modes.includes(userMode) && item.plans.includes(plan));
}
