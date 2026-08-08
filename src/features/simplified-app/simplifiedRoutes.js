import { SIMPLIFIED_FEATURE_FLAGS } from './simplifiedFeatureFlags.js';
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

const AGENDA_NAVIGATION_ITEM = Object.freeze({
  id: SIMPLIFIED_ROUTE_IDS.AGENDA,
  label: 'Agenda',
  path: SIMPLIFIED_ROUTES.AGENDA,
});

const ACCOUNT_NAVIGATION_ITEM = Object.freeze({
  id: SIMPLIFIED_ROUTE_IDS.ACCOUNT,
  label: 'Conta',
  path: SIMPLIFIED_ROUTES.ACCOUNT,
});

const SUPPORT_NAVIGATION_ITEM = Object.freeze({
  id: SIMPLIFIED_ROUTE_IDS.SUPPORT,
  label: 'Suporte',
  path: SIMPLIFIED_ROUTES.SUPPORT,
});

export function buildSimplifiedNavigation({ agendaEnabled = false, supportNavEnabled = false } = {}) {
  return Object.freeze([
    ...BASE_NAVIGATION,
    ...(agendaEnabled ? [AGENDA_NAVIGATION_ITEM] : []),
    ...(supportNavEnabled ? [SUPPORT_NAVIGATION_ITEM] : []),
    ACCOUNT_NAVIGATION_ITEM,
  ]);
}

export function resolveSimplifiedNavigation(featureFlags = {}) {
  return buildSimplifiedNavigation({
    agendaEnabled: featureFlags.agendaEnabled === true,
    supportNavEnabled: featureFlags.supportNavEnabled === true,
  });
}

export const SIMPLIFIED_NAVIGATION = resolveSimplifiedNavigation(SIMPLIFIED_FEATURE_FLAGS);
