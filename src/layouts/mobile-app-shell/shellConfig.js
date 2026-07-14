function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export const MOBILE_SHELL_BREAKPOINTS = deepFreeze({
  minimum: 320,
  maximum: 768,
  desktopSidebar: 1024,
});

export const MOBILE_SHELL_CONFIG = deepFreeze({
  appName: 'UniFlow AI',
  defaultTitle: 'Home',
  pwa: {
    standaloneReady: true,
    safeAreas: true,
  },
});

export { deepFreeze };
