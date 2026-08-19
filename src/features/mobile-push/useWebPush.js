import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '../../app/SessionContext.jsx';
import { detectMobilePushCapabilities } from './mobilePushCapabilities.js';
import { urlBase64ToUint8Array } from './vapidKeyEncoding.js';
import { revokePushSubscription, upsertPushSubscription } from './pushSubscriptionService.js';
import { sendTestNotification } from './pushEdgeFunctions.js';

export const PUSH_STATUS = Object.freeze({
  UNSUPPORTED: 'unsupported',
  NOT_CONFIGURED: 'not_configured',
  CHECKING: 'checking',
  DEFAULT: 'default',
  DENIED: 'denied',
  ENABLING: 'enabling',
  ENABLED: 'enabled',
  DISABLING: 'disabling',
  SENDING_TEST: 'sending_test',
  ERROR: 'error',
});

const VAPID_PUBLIC_KEY = (import.meta.env ?? {}).VITE_VAPID_PUBLIC_KEY ?? '';

function resolvePlatform(capabilities) {
  if (capabilities.isIOS) return 'ios';
  if (capabilities.isAndroid) return 'android';
  return 'desktop';
}

// PUSH1 (correcao de race): unico ponto que converte um PushSubscription do
// BROWSER em uma chamada a upsertPushSubscription -- reutilizado pelo
// self-healing do mount E por enableNotifications(), para nunca duplicar
// (e nunca desalinhar) a extracao de endpoint/p256dh/auth. Nunca cria uma
// subscription nova aqui -- so persiste a que jah foi obtida/reutilizada
// (subscribe() no browser jah devolve a mesma subscription existente
// quando a applicationServerKey bate, por spec do Push API).
async function persistBrowserSubscription({
  userId, workspaceId, subscription, capabilities,
}) {
  const json = subscription.toJSON();
  return upsertPushSubscription(userId, {
    workspaceId,
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    platform: resolvePlatform(capabilities),
  });
}

/**
 * PUSH1: fundacao de Web Push -- so prova que o pipe funciona (autorizar ->
 * subscription salva -> push de teste -> toque abre a UniFlow). Nao decide
 * QUANDO notificar (isso e integracao futura da Agenda) -- so ativa/
 * desativa a capacidade do dispositivo e permite disparar a UNICA
 * notificacao de teste permitida nesta fase.
 */
export function useWebPush() {
  const { user, workspace } = useSession();
  const userId = user?.id ?? null;
  const workspaceId = workspace?.id ?? null;

  const capabilities = useMemo(() => detectMobilePushCapabilities(), []);
  const isPushConfigured = Boolean(VAPID_PUBLIC_KEY);

  const [status, setStatus] = useState(() => {
    if (!capabilities.isSupported) return PUSH_STATUS.UNSUPPORTED;
    if (!isPushConfigured) return PUSH_STATUS.NOT_CONFIGURED;
    if (capabilities.permission === 'denied') return PUSH_STATUS.DENIED;
    return PUSH_STATUS.CHECKING;
  });
  const [error, setError] = useState(null);
  const [lastTestResult, setLastTestResult] = useState(null);

  // PUSH1 (correcao de race): no mount, reconcilia com a subscription REAL
  // do navegador -- nunca confia so em Notification.permission, e (esta e
  // a correcao) nunca confia so em existir um PushSubscription local no
  // browser. Uma subscription local pode ser "orfa": criada numa tentativa
  // anterior (ex.: interrompida, ou vitima do bug historico do upsert) sem
  // nunca ter sido persistida/estar ativa no Supabase. Declarar ENABLED
  // sem confirmar isso deixava "Enviar notificação de teste" clicavel
  // antes de existir qualquer linha em push_subscriptions -- exatamente o
  // 404 real visto no teste fisico. Agora: acha subscription local ->
  // AWAIT a persistencia (self-healing, reaproveitando a MESMA
  // subscription, nunca gerando uma nova) -> só então ENABLED.
  useEffect(() => {
    if (!capabilities.isSupported || !isPushConfigured || !userId) return undefined;

    // PUSH1: setState nunca sincrono dentro do efeito (mesmo padrao de
    // useNotifications.js/refresh) -- toda transicao de estado passa pelo
    // corpo assincrono abaixo, mesmo os casos que nao precisam esperar
    // nada de verdade (permission default/denied).
    let cancelled = false;
    (async () => {
      if (capabilities.permission !== 'granted') {
        if (!cancelled) setStatus(capabilities.permission === 'denied' ? PUSH_STATUS.DENIED : PUSH_STATUS.DEFAULT);
        return;
      }

      if (!cancelled) setStatus(PUSH_STATUS.CHECKING);

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (cancelled) return;

        if (!subscription) {
          setStatus(PUSH_STATUS.DEFAULT);
          return;
        }

        const result = await persistBrowserSubscription({ userId, workspaceId, subscription, capabilities });
        if (cancelled) return;

        if (result.error) {
          // PUSH1: self-healing falhou (ex.: offline no exato momento do
          // mount) -- nunca finge ENABLED. Volta pro estado neutro; o
          // proprio botao "Ativar notificações" tenta de novo no proximo
          // toque (subscribe() reaproveita a mesma subscription do browser,
          // nao cria uma nova).
          setStatus(PUSH_STATUS.DEFAULT);
          return;
        }

        setStatus(PUSH_STATUS.ENABLED);
      } catch {
        if (!cancelled) setStatus(PUSH_STATUS.DEFAULT);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [capabilities, isPushConfigured, userId, workspaceId]);

  const enableNotifications = useCallback(async () => {
    if (!capabilities.isSupported || !isPushConfigured || !userId) return null;
    setStatus(PUSH_STATUS.ENABLING);
    setError(null);

    try {
      // PUSH1: Notification.requestPermission() so pode ser chamado a
      // partir de um gesto explicito do usuario (toque no botao) -- nunca
      // automaticamente ao abrir o app. Este metodo so e invocado pelo
      // onClick do botao "Ativar notificacoes" (ver SettingsPage.jsx).
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? PUSH_STATUS.DENIED : PUSH_STATUS.DEFAULT);
        return null;
      }

      const registration = await navigator.serviceWorker.ready;
      // PUSH1: subscribe() com a MESMA applicationServerKey devolve a
      // subscription EXISTENTE se o browser ja tiver uma (nunca cria uma
      // segunda) -- por isso o mount effect e este metodo podem chamar
      // persistBrowserSubscription livremente sem duplicar subscriptions
      // no push service.
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const result = await persistBrowserSubscription({ userId, workspaceId, subscription, capabilities });

      if (result.error) {
        setStatus(PUSH_STATUS.ERROR);
        setError(result.error);
        return result;
      }

      setStatus(PUSH_STATUS.ENABLED);
      return result;
    } catch (err) {
      setStatus(PUSH_STATUS.ERROR);
      setError({ code: 'SUBSCRIBE_FAILED', message: err?.message ?? 'push_subscribe_failed' });
      return null;
    }
  }, [capabilities, isPushConfigured, userId, workspaceId]);

  const disableNotifications = useCallback(async () => {
    if (!capabilities.isSupported || !userId) return null;
    setStatus(PUSH_STATUS.DISABLING);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const { endpoint } = subscription;
        await subscription.unsubscribe();
        await revokePushSubscription(userId, endpoint);
      }
      setStatus(PUSH_STATUS.DEFAULT);
      return true;
    } catch (err) {
      setStatus(PUSH_STATUS.ERROR);
      setError({ code: 'UNSUBSCRIBE_FAILED', message: err?.message ?? 'push_unsubscribe_failed' });
      return null;
    }
  }, [capabilities, userId]);

  const sendTest = useCallback(async () => {
    setStatus(PUSH_STATUS.SENDING_TEST);
    const result = await sendTestNotification({ workspaceId });
    setLastTestResult(result);
    setStatus(result.error ? PUSH_STATUS.ERROR : PUSH_STATUS.ENABLED);
    if (result.error) setError(result.error);
    return result;
  }, [workspaceId]);

  return {
    capabilities,
    isPushConfigured,
    status,
    error,
    lastTestResult,
    enableNotifications,
    disableNotifications,
    sendTest,
  };
}
