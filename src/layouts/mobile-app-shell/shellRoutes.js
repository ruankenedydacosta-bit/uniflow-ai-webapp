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
  { id: 'profile', label: 'Perfil', icon: '◎', group: 'account', path: '/configuracoes', section: 'profile', moduleId: MODULE_IDS.CONFIGURACOES },
  { id: 'settings', label: 'Configurações', icon: '⚙', group: 'account', path: '/configuracoes', moduleId: MODULE_IDS.CONFIGURACOES },
  { id: 'security', label: 'Segurança', icon: '◇', group: 'account', path: '/configuracoes', section: 'security', moduleId: MODULE_IDS.CONFIGURACOES },
  { id: 'goals', label: 'Objetivos', icon: '○', group: 'product', path: '/objetivos', moduleId: MODULE_IDS.OBJETIVOS },
  { id: 'future', label: 'Visão de Futuro', icon: '◎', group: 'product', path: '/futuro', moduleId: MODULE_IDS.FUTURO },
  { id: 'categories', label: 'Categorias', icon: '▦', group: 'product', path: '/categorias', moduleId: MODULE_IDS.CATEGORIAS },
  { id: 'open-finance', label: 'Open Finance', icon: '⇄', group: 'product', path: '/open-finance', moduleId: MODULE_IDS.OPEN_FINANCE },
  { id: 'reports', label: 'Relatórios', icon: '▥', group: 'product', path: '/relatorios', moduleId: MODULE_IDS.RELATORIOS },
  { id: 'notifications', label: 'Notificações', icon: '!', group: 'product', action: 'notifications' },
  { id: 'support', label: 'Suporte', icon: '?', group: 'product', action: 'support' },
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
