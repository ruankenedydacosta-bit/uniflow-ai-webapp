export const SIMPLIFIED_ROUTE_IDS = Object.freeze({
  HOME: 'home',
  RECORDS: 'records',
  ACCOUNT: 'account',
});

export const SIMPLIFIED_ROUTES = Object.freeze({
  HOME: '/app/home',
  RECORDS: '/app/registros',
  ACCOUNT: '/app/conta',
  UNI: '/app/uni',
});

export const SIMPLIFIED_NAVIGATION = Object.freeze([
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
  Object.freeze({
    id: SIMPLIFIED_ROUTE_IDS.ACCOUNT,
    label: 'Conta',
    path: SIMPLIFIED_ROUTES.ACCOUNT,
  }),
]);
