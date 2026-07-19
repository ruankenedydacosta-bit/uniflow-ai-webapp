import { PLANS, USER_MODES, WORKSPACE_TYPES } from './access.js';
import { canAccessNavigationItem } from './accessRules.js';

const ALL_MODES = [USER_MODES.PERSONAL, USER_MODES.BUSINESS, USER_MODES.BOTH];
const ALL_PLANS = [PLANS.FREE, PLANS.PRO, PLANS.BUSINESS, PLANS.ENTERPRISE];
const ALL_WORKSPACES = [WORKSPACE_TYPES.PERSONAL, WORKSPACE_TYPES.BUSINESS];
const BUSINESS_MODES = [USER_MODES.BUSINESS, USER_MODES.BOTH];
const BUSINESS_PLANS = [PLANS.BUSINESS, PLANS.ENTERPRISE];
const BUSINESS_WORKSPACES = [WORKSPACE_TYPES.BUSINESS];

export const navigationItems = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    modes: ALL_MODES,
    plans: ALL_PLANS,
    workspaces: ALL_WORKSPACES,
    description: 'Visão inicial do espaço financeiro ativo.',
  },
  {
    label: 'Uni AI',
    path: '/uni-ai',
    modes: ALL_MODES,
    plans: ALL_PLANS,
    workspaces: ALL_WORKSPACES,
    description: 'Consultora financeira inteligente da UniFlow AI.',
  },
  {
    label: 'Financeiro',
    path: '/financeiro',
    modes: ALL_MODES,
    plans: ALL_PLANS,
    workspaces: ALL_WORKSPACES,
    description: 'Receitas, despesas, saldo e fluxo financeiro.',
  },
  {
    label: 'Objetivos',
    path: '/objetivos',
    modes: ALL_MODES,
    plans: ALL_PLANS,
    workspaces: ALL_WORKSPACES,
    description: 'Destinos financeiros conectados ao GPS da UniFlow AI.',
  },
  {
    label: 'Visão de Futuro',
    path: '/futuro',
    modes: ALL_MODES,
    plans: ALL_PLANS,
    workspaces: ALL_WORKSPACES,
    description: 'Projeções financeiras com cenários para planejamento.',
  },
  {
    label: 'CRM',
    path: '/crm',
    modes: BUSINESS_MODES,
    plans: BUSINESS_PLANS,
    workspaces: BUSINESS_WORKSPACES,
    description: 'Relacionamento comercial e oportunidades de negócio.',
  },
  {
    label: 'Clientes',
    path: '/clientes',
    modes: BUSINESS_MODES,
    plans: BUSINESS_PLANS,
    workspaces: BUSINESS_WORKSPACES,
    description: 'Relacionamentos, cobranças e próximos passos empresariais.',
  },
  {
    label: 'Projetos',
    path: '/projetos',
    modes: BUSINESS_MODES,
    plans: BUSINESS_PLANS,
    workspaces: BUSINESS_WORKSPACES,
    description: 'Projetos e entregas ligados ao espaço empresarial.',
  },
  {
    label: 'Agenda',
    path: '/agenda',
    modes: ALL_MODES,
    plans: ALL_PLANS,
    workspaces: ALL_WORKSPACES,
    description: 'Compromissos, decisões e eventos financeiros.',
  },
  {
    label: 'Relatórios',
    path: '/relatorios',
    modes: ALL_MODES,
    plans: [PLANS.PRO, PLANS.BUSINESS, PLANS.ENTERPRISE],
    workspaces: ALL_WORKSPACES,
    description: 'Leituras e análises do contexto financeiro.',
  },
  {
    label: 'Configurações',
    path: '/configuracoes',
    modes: ALL_MODES,
    plans: ALL_PLANS,
    workspaces: ALL_WORKSPACES,
    description: 'Preferências do usuário, espaço e produto.',
  },
];

// O filtro usa o acesso demo hoje; depois será alimentado pelo onboarding/login reais.
export function filterNavigationItems(items, access) {
  return items.filter((item) => canAccessNavigationItem(item, access));
}
