export const PWA_INSTALL_FLAG_KEY = 'VITE_PWA_INSTALL_PROMPT_ENABLED';
export const PWA_INSTALL_DISMISS_KEY = 'uniflow.pwa-install.dismissed-until';
export const PWA_INSTALL_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export function resolvePwaInstallEnabled(env = {}) {
  return env?.[PWA_INSTALL_FLAG_KEY] === 'true';
}

export const PWA_INSTALL_ENABLED = resolvePwaInstallEnabled(import.meta.env);
