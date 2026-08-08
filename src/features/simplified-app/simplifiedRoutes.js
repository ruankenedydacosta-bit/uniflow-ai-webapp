import { ACCOUNT_SUBROUTE_IDS, ACCOUNT_SUBROUTES } from './simplifiedAccountRoutes.js';

export const SIMPLIFIED_ROUTE_IDS = Object.freeze({
  HOME: 'home',
  RECORDS: 'records',
  AGENDA: 'agenda',
  SUPPORT: 'support',
  ACCOUNT: 'account',
});

export const SIMPLIFIED_ROUTES = Object.freeze({
  HOME: '/app/home',
  RECORDS: '/app/registros',
  AGENDA: '/app/agenda',
  SUPPORT: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.SUPPORT].path,
  SUPPORT_CHAT: `${ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.SUPPORT].path}/uni`,
  ACCOUNT: '/app/conta',
  UNI: '/app/uni',
});

const BASE_NAVIGATION = Object.freeze([
  Object.freeze({
    id: SIMPLIFIED_ROUTE_IDS.HOME,
    label: 'Home',
    path: SIMPLIFIED_ROUTES.HOME,
  }),
  Object.freeze({
    id: SIMPLIFIED_ROUTE_IDS.RECORDS,
    label: 'Registros',
    path: SIMPLIFIED_ROUTES.RECORDS,
  }),
]);

// LOTE D: a base de navegação é FIXA -- Home | Registros | Conta. Agenda e
// Suporte NÃO aparecem na barra inferior: são alcançados por fluxos
// internos (/app/agenda via a Uni, /app/conta/suporte/uni via Conta), com
// as rotas sempre registradas. As flags de habilitação continuam existindo
// para mudanças programáticas, mas a estrutura fixa é a fonte da verdade
// do componente de navegação.
const ACCOUNT_NAVIGATION_ITEM = Object.freeze({
  id: SIMPLIFIED_ROUTE_IDS.ACCOUNT,
  label: 'Conta',
  path: SIMPLIFIED_ROUTES.ACCOUNT,
});

export function buildSimplifiedNavigation() {
  return Object.freeze([...BASE_NAVIGATION, ACCOUNT_NAVIGATION_ITEM]);
}

export function resolveSimplifiedNavigation() {
  return buildSimplifiedNavigation();
}

export const SIMPLIFIED_NAVIGATION = resolveSimplifiedNavigation();
