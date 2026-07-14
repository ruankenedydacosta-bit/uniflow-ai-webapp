import { deepFreeze } from './shellConfig.js';

export const SHELL_ROUTE_IDS = deepFreeze({
  HOME: 'home',
  FINANCE: 'finance',
  UNI: 'uni',
  AGENDA: 'agenda',
  MORE: 'more',
});

export const BOTTOM_NAVIGATION_ROUTES = deepFreeze([
  { id: SHELL_ROUTE_IDS.HOME, label: 'Home', path: '/dashboard' },
  { id: SHELL_ROUTE_IDS.FINANCE, label: 'Financeiro', path: '/financeiro' },
  { id: SHELL_ROUTE_IDS.UNI, label: 'Uni', path: '/uni-ai', center: true },
  { id: SHELL_ROUTE_IDS.AGENDA, label: 'Agenda', path: '/agenda' },
  { id: SHELL_ROUTE_IDS.MORE, label: 'Mais', action: 'open-more-menu' },
]);

export const MORE_MENU_ROUTES = deepFreeze([
  { id: 'profile', label: 'Perfil', icon: '◎', group: 'account', path: '/configuracoes', section: 'profile' },
  { id: 'settings', label: 'Configurações', icon: '⚙', group: 'account', path: '/configuracoes' },
  { id: 'security', label: 'Segurança', icon: '◇', group: 'account', path: '/configuracoes', section: 'security' },
  { id: 'goals', label: 'Objetivos', icon: '○', group: 'product', path: '/objetivos' },
  { id: 'categories', label: 'Categorias', icon: '▦', group: 'product', path: '/financeiro', section: 'categories' },
  { id: 'notifications', label: 'Notificações', icon: '!', group: 'product', action: 'notifications' },
  { id: 'support', label: 'Suporte', icon: '?', group: 'product', action: 'support' },
  { id: 'sign-out', label: 'Sair', icon: '↪', group: 'session', action: 'sign-out', destructive: true },
]);

export function findShellRouteByPath(pathname = '') {
  return BOTTOM_NAVIGATION_ROUTES.find((route) => route.path === pathname) ?? null;
}
