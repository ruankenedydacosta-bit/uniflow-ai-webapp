import { canAccessModule } from './moduleAccess.js';

export function canAccessNavigationItem(item, access = {}) {
  const { userMode, plan, currentWorkspace, capabilities = {} } = access;
  const canUseMode = item.modes.includes(userMode);
  const canUsePlan = !item.plans || item.plans.includes(plan);
  const canUseCapability = !item.capabilityId || capabilities[item.capabilityId] === true;
  const canUseWorkspace = !item.workspaces || item.workspaces.includes(currentWorkspace);

  return canUseMode && canUsePlan && canUseCapability && canUseWorkspace;
}

export function canAccessRoute(route, access) {
  if (!route) return false;

  return canAccessNavigationItem(route, access);
}

/**
 * Guard de CONTEXTO (PF/PJ) por rota — ortogonal a plano/modo.
 * Usa exclusivamente `moduleAccess.js`. Uma rota sem `moduleId` mapeado não é
 * bloqueada por contexto (fail-open apenas para rotas técnicas ainda não mapeadas;
 * plano/modo continuam checados separadamente por `canAccessRoute`).
 */
export function canAccessRouteInContext(route, currentWorkspace) {
  if (!route || !route.moduleId) return true;
  return canAccessModule(route.moduleId, currentWorkspace);
}

const GENERIC_FALLBACK = '/dashboard';

/**
 * REGRA ÚNICA E DOCUMENTADA de fallback de rota (sem depender do histórico):
 *   1) Home do contexto atual (`/dashboard` — módulo compartilhado, sempre seguro);
 *   2) primeiro módulo compartilhado seguro do contexto (via `moduleAccess.js`);
 *   3) fallback genérico autenticado (`/dashboard`).
 * `routeMeta` é uma lista de `{ moduleId, path }` (tipicamente `navigationItems`),
 * evitando um segundo mapa concorrente ao `moduleAccess.js`.
 */
export function getFallbackRoute(currentWorkspace, routeMeta = []) {
  const withModule = routeMeta.filter((r) => r && r.moduleId && r.path);

  const dashboard = withModule.find((r) => r.moduleId === 'dashboard');
  if (dashboard && canAccessModule(dashboard.moduleId, currentWorkspace)) {
    return dashboard.path;
  }

  const firstSafe = withModule.find((r) => canAccessModule(r.moduleId, currentWorkspace));
  if (firstSafe) return firstSafe.path;

  return GENERIC_FALLBACK;
}
