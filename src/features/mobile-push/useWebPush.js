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

  // PUSH1: no mount, reconcilia com a subscription REAL do navegador --
  // nunca confia so em Notification.permission (permissao concedida nao
  // garante que uma subscription ainda exista; o usuario pode te-la
  // revogado por outro caminho, ex.: configuracoes do proprio navegador).
  useEffect(() => {
    if (!capabilities.isSupported || !isPushConfigured) return undefined;

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

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (cancelled) return;
        setStatus(subscription ? PUSH_STATUS.ENABLED : PUSH_STATUS.DEFAULT);
      } catch {
        if (!cancelled) setStatus(PUSH_STATUS.DEFAULT);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [capabilities.isSupported, capabilities.permission, isPushConfigured]);

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
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const json = subscription.toJSON();

      const result = await upsertPushSubscription(userId, {
        workspaceId,
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        platform: resolvePlatform(capabilities),
      });

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
