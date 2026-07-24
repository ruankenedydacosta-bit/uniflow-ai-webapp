import { MODULE_IDS, canAccessModule } from '../../app/moduleAccess.js';
import { deepFreeze } from './shellConfig.js';

export const SHELL_ROUTE_IDS = deepFreeze({
  HOME: 'home',
  FINANCE: 'finance',
  UNI: 'uni',
  AGENDA: 'agenda',
  MORE: 'more',
});

// `moduleId` liga cada rota da shell mobile ao mapa declarativo único (moduleAccess.js),
// exatamente como navigation.js faz no desktop. Rotas sem `moduleId` (ações puras como
// abrir o menu, notificações, suporte, sair) são sempre visíveis.
export const BOTTOM_NAVIGATION_ROUTES = deepFreeze([
  { id: SHELL_ROUTE_IDS.HOME, label: 'Home', path: '/dashboard', moduleId: MODULE_IDS.DASHBOARD },
  { id: SHELL_ROUTE_IDS.FINANCE, label: 'Financeiro', path: '/financeiro', moduleId: MODULE_IDS.FINANCEIRO },
  { id: SHELL_ROUTE_IDS.UNI, label: 'Uni', path: '/uni-ai', center: true, moduleId: MODULE_IDS.UNI_AI },
  { id: SHELL_ROUTE_IDS.AGENDA, label: 'Agenda', path: '/agenda', moduleId: MODULE_IDS.AGENDA },
  { id: SHELL_ROUTE_IDS.MORE, label: 'Mais', action: 'open-more-menu' },
]);

export const MORE_MENU_ROUTES = deepFreeze([
  // UX3: profile/settings/security apontavam todos para '/configuracoes' sem
  // diferenciacao real (duplicacao confusa apontada na auditoria UX1) -- cada
  // um agora leva a uma secao propria e enderecavel via ?section=, mesmos
  // valores canonicos usados pelo AccountMenu desktop (Topbar/AccountMenu.jsx).
  { id: 'profile', label: 'Perfil', icon: '◎', group: 'account', path: '/configuracoes', section: 'perfil', moduleId: MODULE_IDS.CONFIGURACOES },
  { id: 'settings', label: 'Configurações', icon: '⚙', group: 'account', path: '/configuracoes', section: 'preferencias', moduleId: MODULE_IDS.CONFIGURACOES },
  { id: 'security', label: 'Segurança', icon: '◇', group: 'account', path: '/configuracoes', section: 'seguranca', moduleId: MODULE_IDS.CONFIGURACOES },
  // Grupo 'management': mesmos módulos BUSINESS_ONLY já usados pela Sidebar
  // desktop (moduleAccess.js) -- ate UX2 essas 3 rotas nao existiam em lugar
  // nenhum da navegacao mobile (achado P0 da auditoria UX1), so acessiveis
  // digitando a URL direto. Visibilidade derivada exclusivamente de
  // filterShellRoutesByContext/canAccessModule, sem nova regra hardcoded.
  { id: 'clients', label: 'Clientes', icon: '◈', group: 'management', path: '/clientes', moduleId: MODULE_IDS.CLIENTES },
  { id: 'crm', label: 'CRM', icon: '◆', group: 'management', path: '/crm', moduleId: MODULE_IDS.CRM },
  { id: 'projects', label: 'Projetos', icon: '▤', group: 'management', path: '/projetos', moduleId: MODULE_IDS.PROJETOS },
  { id: 'goals', label: 'Objetivos', icon: '○', group: 'product', path: '/objetivos', moduleId: MODULE_IDS.OBJETIVOS },
  { id: 'future', label: 'Visão de Futuro', icon: '◎', group: 'product', path: '/futuro', moduleId: MODULE_IDS.FUTURO },
  { id: 'categories', label: 'Categorias', icon: '▦', group: 'product', path: '/categorias', moduleId: MODULE_IDS.CATEGORIAS },
  { id: 'open-finance', label: 'Open Finance', icon: '⇄', group: 'product', path: '/open-finance', moduleId: MODULE_IDS.OPEN_FINANCE },
  { id: 'reports', label: 'Relatórios', icon: '▥', group: 'product', path: '/relatorios', moduleId: MODULE_IDS.RELATORIOS },
  // comingSoon: true -- ainda sem funcionalidade real (achado P0 da UX1:
  // eram clicaveis sem nenhuma acao). Sem `path` nem `action`: MoreMenu
  // renderiza como item desabilitado, nunca chama onNavigate/onAction.
  { id: 'notifications', label: 'Notificações', icon: '!', group: 'product', comingSoon: true },
  { id: 'support', label: 'Suporte', icon: '?', group: 'product', comingSoon: true },
  { id: 'sign-out', label: 'Sair', icon: '↪', group: 'session', action: 'sign-out', destructive: true },
]);

export function findShellRouteByPath(pathname = '') {
  return BOTTOM_NAVIGATION_ROUTES.find((route) => route.path === pathname) ?? null;
}

/**
 * Filtra rotas da shell mobile pelo contexto PF/PJ ativo usando o MESMO mapa
 * declarativo do desktop. Rotas sem `moduleId` (ações puras) passam sempre.
 * Hoje nenhuma rota da shell é PJ-only, então o resultado é idêntico ao atual;
 * a infra fica pronta para quando alguma rota mobile passar a ser exclusiva.
 */
export function filterShellRoutesByContext(routes = [], context) {
  return routes.filter((route) =>
    route.moduleId ? canAccessModule(route.moduleId, context) : true,
  );
}
