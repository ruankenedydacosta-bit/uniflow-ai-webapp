import { PLANS, USER_MODES } from './access.js';
import { canAccessNavigationItem } from './accessRules.js';
import { MODULE_IDS, getModuleContexts } from './moduleAccess.js';

const ALL_MODES = [USER_MODES.PERSONAL, USER_MODES.BUSINESS, USER_MODES.BOTH];
const ALL_PLANS = [PLANS.FREE, PLANS.PRO, PLANS.BUSINESS, PLANS.ENTERPRISE];
const BUSINESS_MODES = [USER_MODES.BUSINESS, USER_MODES.BOTH];
const BUSINESS_PLANS = [PLANS.BUSINESS, PLANS.ENTERPRISE];

// UX6: fonte única de agrupamento da sidebar desktop -- ordem de exibição e
// rótulo de cada grupo. Cada item de `navigationItems` abaixo referencia um
// destes ids via `group`; a Sidebar apenas itera esta lista e filtra, nunca
// decide sozinha quais módulos existem ou a quem pertencem (isso continua
// vindo de moduleAccess.js/canAccessNavigationItem). "Gestão" reutiliza o
// mesmo nome já usado pelo grupo equivalente no menu mobile (shellRoutes.js/
// MoreMenu.jsx) para os mesmos 3 módulos BUSINESS_ONLY -- classificação
// consistente entre desktop e mobile, ainda que os arquivos-fonte
// permaneçam separados (ver relatório da fase sobre por que não foram
// unificados).
export const SIDEBAR_GROUPS = Object.freeze([
  { id: 'visao-geral', label: 'Visão geral' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'gestao', label: 'Gestão' },
  { id: 'uni', label: 'Uni' },
  { id: 'conta', label: 'Conta' },
]);

// `workspaces` (contexto PF/PJ) deriva SEMPRE do mapa declarativo único
// (moduleAccess.js). `modes`/`plans` permanecem gating ortogonal (modo de uso e plano).
export const navigationItems = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    moduleId: MODULE_IDS.DASHBOARD,
    modes: ALL_MODES,
    plans: ALL_PLANS,
    workspaces: getModuleContexts(MODULE_IDS.DASHBOARD),
    description: 'Visão inicial do espaço financeiro ativo.',
    group: 'visao-geral',
  },
  {
    label: 'Uni AI',
    path: '/uni-ai',
    moduleId: MODULE_IDS.UNI_AI,
    modes: ALL_MODES,
    plans: ALL_PLANS,
    workspaces: getModuleContexts(MODULE_IDS.UNI_AI),
    description: 'Consultora financeira inteligente da UniFlow AI.',
    group: 'uni',
  },
  {
    label: 'Financeiro',
    path: '/financeiro',
    moduleId: MODULE_IDS.FINANCEIRO,
    modes: ALL_MODES,
    plans: ALL_PLANS,
    workspaces: getModuleContexts(MODULE_IDS.FINANCEIRO),
    description: 'Entradas, saídas, saldo e fluxo financeiro.',
    group: 'financeiro',
  },
  {
    label: 'Categorias',
    path: '/categorias',
    moduleId: MODULE_IDS.CATEGORIAS,
    modes: ALL_MODES,
    plans: ALL_PLANS,
    workspaces: getModuleContexts(MODULE_IDS.CATEGORIAS),
    description: 'Onde cada valor deve ficar: saídas e entradas.',
    group: 'financeiro',
  },
  {
    label: 'Open Finance',
    path: '/open-finance',
    moduleId: MODULE_IDS.OPEN_FINANCE,
    modes: ALL_MODES,
    plans: ALL_PLANS,
    workspaces: getModuleContexts(MODULE_IDS.OPEN_FINANCE),
    description: 'Prévia de como a UniFlow vai centralizar suas contas (em breve).',
    group: 'financeiro',
  },
  {
    label: 'Metas',
    path: '/metas',
    moduleId: MODULE_IDS.OBJETIVOS,
    modes: ALL_MODES,
    plans: ALL_PLANS,
    workspaces: getModuleContexts(MODULE_IDS.OBJETIVOS),
    description: 'Destinos financeiros conectados ao GPS da UniFlow AI.',
    group: 'financeiro',
  },
  {
    label: 'Visão de Futuro',
    path: '/futuro',
    moduleId: MODULE_IDS.FUTURO,
    modes: ALL_MODES,
    plans: ALL_PLANS,
    workspaces: getModuleContexts(MODULE_IDS.FUTURO),
    description: 'Projeções financeiras com cenários para planejamento.',
    group: 'visao-geral',
  },
  {
    label: 'CRM',
    path: '/crm',
    moduleId: MODULE_IDS.CRM,
    modes: BUSINESS_MODES,
    plans: BUSINESS_PLANS,
    workspaces: getModuleContexts(MODULE_IDS.CRM),
    description: 'Relacionamento comercial e oportunidades de negócio.',
    group: 'gestao',
  },
  {
    label: 'Clientes',
    path: '/clientes',
    moduleId: MODULE_IDS.CLIENTES,
    modes: BUSINESS_MODES,
    plans: BUSINESS_PLANS,
    workspaces: getModuleContexts(MODULE_IDS.CLIENTES),
    description: 'Relacionamentos, cobranças e próximos passos empresariais.',
    group: 'gestao',
  },
  {
    label: 'Projetos',
    path: '/projetos',
    moduleId: MODULE_IDS.PROJETOS,
    modes: BUSINESS_MODES,
    plans: BUSINESS_PLANS,
    workspaces: getModuleContexts(MODULE_IDS.PROJETOS),
    description: 'Projetos e entregas ligados ao espaço empresarial.',
    group: 'gestao',
  },
  {
    label: 'Agenda',
    path: '/agenda',
    moduleId: MODULE_IDS.AGENDA,
    modes: ALL_MODES,
    plans: ALL_PLANS,
    workspaces: getModuleContexts(MODULE_IDS.AGENDA),
    description: 'Compromissos, decisões e eventos financeiros.',
    group: 'financeiro',
  },
  {
    label: 'Relatórios',
    path: '/relatorios',
    moduleId: MODULE_IDS.RELATORIOS,
    modes: ALL_MODES,
    plans: [PLANS.PRO, PLANS.BUSINESS, PLANS.ENTERPRISE],
    workspaces: getModuleContexts(MODULE_IDS.RELATORIOS),
    description: 'Leituras e análises do contexto financeiro.',
    group: 'visao-geral',
  },
  {
    label: 'Configurações',
    path: '/configuracoes',
    moduleId: MODULE_IDS.CONFIGURACOES,
    modes: ALL_MODES,
    plans: ALL_PLANS,
    workspaces: getModuleContexts(MODULE_IDS.CONFIGURACOES),
    description: 'Preferências do usuário, espaço e produto.',
    group: 'conta',
  },
  {
    label: 'Suporte',
    path: '/suporte',
    moduleId: MODULE_IDS.SUPORTE,
    modes: ALL_MODES,
    plans: ALL_PLANS,
    workspaces: getModuleContexts(MODULE_IDS.SUPORTE),
    description: 'Central de Suporte -- perguntas frequentes e atendimento com a Uni.',
    group: 'conta',
  },
];

// O filtro usa o acesso demo hoje; depois será alimentado pelo onboarding/login reais.
export function filterNavigationItems(items, access) {
  return items.filter((item) => canAccessNavigationItem(item, access));
}
