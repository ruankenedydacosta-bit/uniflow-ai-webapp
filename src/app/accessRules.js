export function canAccessNavigationItem(item, { userMode, plan, currentWorkspace }) {
  const canUseMode = item.modes.includes(userMode);
  const canUsePlan = item.plans.includes(plan);
  const canUseWorkspace = !item.workspaces || item.workspaces.includes(currentWorkspace);

  return canUseMode && canUsePlan && canUseWorkspace;
}

export function canAccessRoute(route, access) {
  if (!route) return false;

  return canAccessNavigationItem(route, access);
}

export function getFallbackRoute() {
  return '/dashboard';
}
