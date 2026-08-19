// PUSH1: deteccao central de capacidade -- fonte unica usada por
// useWebPush.js e pela UI de Configuracoes, nunca reimplementada em mais de
// um lugar. Sempre feature detection real (nunca assume suporte a partir do
// tipo de dispositivo); User-Agent so entra para distinguir iOS/Android
// especificamente, onde nao existe teste de capacidade equivalente.
export function detectMobilePushCapabilities({ nav = globalThis.navigator, win = globalThis } = {}) {
  const hasServiceWorker = Boolean(nav) && 'serviceWorker' in nav;
  const hasPushManager = 'PushManager' in win;
  const hasNotification = 'Notification' in win;
  const permission = hasNotification ? win.Notification.permission : 'unsupported';

  // display-mode:standalone cobre Android/desktop instalado; navigator.standalone
  // e a propriedade legada (mas ainda a unica) que o Safari expoe para "app
  // adicionado a Tela de Inicio" no iOS.
  const isStandalone = Boolean(
    win.matchMedia?.('(display-mode: standalone)')?.matches || nav?.standalone === true,
  );

  const userAgent = nav?.userAgent ?? '';
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !win.MSStream;
  const isAndroid = /Android/.test(userAgent);

  const isSupported = hasServiceWorker && hasPushManager && hasNotification;
  // PUSH1: no iOS, o Safari so expoe PushManager dentro do contexto
  // standalone (app adicionado a Tela de Inicio) -- isSupported ja reflete
  // isso sozinho (fica false fora do standalone). needsAddToHomeScreen
  // nomeia a MESMA causa de forma acionavel, para a UI explicar o passo
  // que falta em vez de so dizer "nao suportado".
  const needsAddToHomeScreen = isIOS && !isStandalone;

  return Object.freeze({
    hasServiceWorker,
    hasPushManager,
    hasNotification,
    permission,
    isStandalone,
    isIOS,
    isAndroid,
    isSupported,
    needsAddToHomeScreen,
  });
}
