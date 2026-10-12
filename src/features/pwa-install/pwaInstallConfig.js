export const PWA_INSTALL_FLAG_KEY = 'VITE_PWA_INSTALL_PROMPT_ENABLED';
export const PWA_INSTALL_DISMISS_KEY = 'uniflow.pwa-install.dismissed-until';
export const PWA_INSTALLED_KEY = 'uniflow.pwa-install.installed';
export const PWA_INSTALL_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

// IPHONE-INSTALL1: "não podemos esperar que o usuário descubra sozinho" é
// uma decisão definitiva de produto, não um experimento -- a experiência
// de instalação fica LIGADA por padrão em toda release. A env var vira um
// kill switch de emergência (só desliga com 'false' explícito), nunca um
// opt-in que alguém precisa lembrar de ativar no Vercel.
export function resolvePwaInstallEnabled(env = {}) {
  return env?.[PWA_INSTALL_FLAG_KEY] !== 'false';
}

export const PWA_INSTALL_ENABLED = resolvePwaInstallEnabled(import.meta.env);
