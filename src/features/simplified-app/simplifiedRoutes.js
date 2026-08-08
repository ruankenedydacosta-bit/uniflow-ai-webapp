import { SIMPLIFIED_FEATURE_FLAGS } from './simplifiedFeatureFlags.js';

export const SIMPLIFIED_ROUTE_IDS = Object.freeze({
  HOME: 'home',
  RECORDS: 'records',
  AGENDA: 'agenda',
  ACCOUNT: 'account',
});

export const SIMPLIFIED_ROUTES = Object.freeze({
  HOME: '/app/home',
  RECORDS: '/app/registros',
  AGENDA: '/app/agenda',
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

export function buildSimplifiedNavigation({ agendaEnabled = false } = {}) {
  return Object.freeze([
    ...BASE_NAVIGATION,
    ...(agendaEnabled ? [AGENDA_NAVIGATION_ITEM] : []),
    ACCOUNT_NAVIGATION_ITEM,
  ]);
}

export function resolveSimplifiedNavigation(featureFlags = {}) {
  return buildSimplifiedNavigation({ agendaEnabled: featureFlags.agendaEnabled === true });
}

export const SIMPLIFIED_NAVIGATION = resolveSimplifiedNavigation(SIMPLIFIED_FEATURE_FLAGS);
