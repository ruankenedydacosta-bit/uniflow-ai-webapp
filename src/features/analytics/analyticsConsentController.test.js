import assert from 'node:assert/strict';
import test from 'node:test';
import { createGa4Client } from './ga4Client.js';
import { GA4_CONSENT_STATUS } from './ga4Contracts.js';
import { createAnalyticsConsentController } from './analyticsConsentController.js';
import { ANALYTICS_CONSENT_STORAGE_KEY } from './analyticsConsentStorage.js';

const ENABLED_ENV = Object.freeze({
  VITE_GA4_ENABLED: 'true',
  VITE_GA4_MEASUREMENT_ID: 'G-TEST123',
});

function createStorage(initialValue = null) {
  const values = new Map();
  const writes = [];
  if (initialValue !== null) values.set(ANALYTICS_CONSENT_STORAGE_KEY, initialValue);

  return {
    writes,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      writes.push([key, value]);
      values.set(key, value);
    },
  };
}

function createAnalyticsSpy() {
  const calls = [];
  return {
    calls,
    api: {
      setConsent(status) {
        calls.push(['set', status]);
      },
      grantConsent() {
        calls.push(['grant']);
      },
      denyConsent() {
        calls.push(['deny']);
      },
    },
  };
}

function createRuntime() {
  const scripts = [];
  const runtime = {
    location: new URL('https://app.invalid/app/home?_gl=linker-secret'),
    document: {
      createElement: () => ({}),
      getElementById: () => null,
      head: {
        appendChild(script) {
          scripts.push(script);
          return script;
        },
      },
    },
  };
  return { runtime, scripts };
}

function createIntegratedController(initialValue = null) {
  const storage = createStorage(initialValue);
  const { runtime, scripts } = createRuntime();
  const ga4 = createGa4Client({ runtime });
  ga4.initialize(ENABLED_ENV);
  const controller = createAnalyticsConsentController({
    storage,
    analyticsApi: {
      setConsent: ga4.setConsent,
      grantConsent: ga4.grantConsent,
      denyConsent: ga4.denyConsent,
    },
  });

  return { controller, ga4, runtime, scripts, storage };
}

function pageViewCount(runtime) {
  return (runtime.dataLayer ?? [])
    .map((entry) => Array.from(entry))
    .filter((entry) => entry[0] === 'event' && entry[1] === 'page_view')
    .length;
}

test('primeira visita permanece unknown e não persiste uma decisão automática', () => {
  const storage = createStorage();
  const analytics = createAnalyticsSpy();
  const controller = createAnalyticsConsentController({ storage, analyticsApi: analytics.api });

  assert.deepEqual(controller.initialize(), {
    status: GA4_CONSENT_STATUS.UNKNOWN,
    persistence: 'not_saved',
    isConsentHydrated: true,
  });
  assert.deepEqual(storage.writes, []);
  assert.deepEqual(analytics.calls, [['set', GA4_CONSENT_STATUS.UNKNOWN]]);
});

test('aceitar e recusar são decisões explícitas persistidas com as APIs correspondentes', () => {
  const storage = createStorage();
  const analytics = createAnalyticsSpy();
  const controller = createAnalyticsConsentController({ storage, analyticsApi: analytics.api });
  controller.initialize();

  assert.equal(controller.accept().status, GA4_CONSENT_STATUS.GRANTED);
  assert.equal(controller.deny().status, GA4_CONSENT_STATUS.DENIED);
  assert.deepEqual(storage.writes, [
    [ANALYTICS_CONSENT_STORAGE_KEY, GA4_CONSENT_STATUS.GRANTED],
    [ANALYTICS_CONSENT_STORAGE_KEY, GA4_CONSENT_STATUS.DENIED],
  ]);
  assert.deepEqual(analytics.calls, [
    ['set', GA4_CONSENT_STATUS.UNKNOWN],
    ['grant'],
    ['deny'],
  ]);
});

test('granted e denied são restaurados após reload sem nova escolha', () => {
  for (const status of [GA4_CONSENT_STATUS.GRANTED, GA4_CONSENT_STATUS.DENIED]) {
    const storage = createStorage(status);
    const firstAnalytics = createAnalyticsSpy();
    const secondAnalytics = createAnalyticsSpy();

    const firstLoad = createAnalyticsConsentController({ storage, analyticsApi: firstAnalytics.api });
    const reload = createAnalyticsConsentController({ storage, analyticsApi: secondAnalytics.api });

    assert.equal(firstLoad.initialize().status, status);
    assert.equal(reload.initialize().status, status);
    assert.deepEqual(firstAnalytics.calls, [['set', status]]);
    assert.deepEqual(secondAnalytics.calls, [['set', status]]);
  }
});

test('revogação persiste denied e impede novos pageviews pela fundação GA4', () => {
  const storage = createStorage(GA4_CONSENT_STATUS.GRANTED);
  const { runtime } = createRuntime();
  const ga4 = createGa4Client({ runtime });
  ga4.initialize(ENABLED_ENV);
  const controller = createAnalyticsConsentController({
    storage,
    analyticsApi: {
      setConsent: ga4.setConsent,
      grantConsent: ga4.grantConsent,
      denyConsent: ga4.denyConsent,
    },
  });

  controller.initialize();
  assert.equal(ga4.trackPageView({ pathname: '/app/home' }).sent, true);
  controller.deny();
  assert.equal(runtime['ga-disable-G-TEST123'], true);
  assert.equal(ga4.trackPageView({ pathname: '/app/registros' }).reason, 'blocked');
  assert.equal(storage.getItem(ANALYTICS_CONSENT_STORAGE_KEY), GA4_CONSENT_STATUS.DENIED);

  controller.accept();
  assert.equal(runtime['ga-disable-G-TEST123'], false);
  assert.equal(ga4.trackPageView({ pathname: '/app/registros' }).sent, true);
});

test('nenhum request ou dataLayer existe antes de aceitar; aceitar libera a rota atual', () => {
  const storage = createStorage();
  const { runtime, scripts } = createRuntime();
  const ga4 = createGa4Client({ runtime });
  ga4.initialize(ENABLED_ENV);
  const controller = createAnalyticsConsentController({
    storage,
    analyticsApi: {
      setConsent: ga4.setConsent,
      grantConsent: ga4.grantConsent,
      denyConsent: ga4.denyConsent,
    },
  });

  controller.initialize();
  assert.equal(scripts.length, 0);
  assert.equal('dataLayer' in runtime, false);
  assert.equal(ga4.trackPageView({ pathname: '/app/home' }).reason, 'blocked');

  controller.accept();
  assert.equal(scripts.length, 1);
  assert.equal(ga4.trackPageView({ pathname: '/app/home' }).sent, true);
});

test('GA4 desligado por env continua sem request mesmo com granted persistido', () => {
  const storage = createStorage(GA4_CONSENT_STATUS.GRANTED);
  const { runtime, scripts } = createRuntime();
  const ga4 = createGa4Client({ runtime });
  ga4.initialize({
    VITE_GA4_ENABLED: 'false',
    VITE_GA4_MEASUREMENT_ID: 'G-TEST123',
  });
  const controller = createAnalyticsConsentController({
    storage,
    analyticsApi: {
      setConsent: ga4.setConsent,
      grantConsent: ga4.grantConsent,
      denyConsent: ga4.denyConsent,
    },
  });

  controller.initialize();
  assert.equal(controller.getState().status, GA4_CONSENT_STATUS.GRANTED);
  assert.equal(scripts.length, 0);
  assert.equal('dataLayer' in runtime, false);
});

test('inicialização repetida equivalente ao StrictMode restaura somente uma vez', () => {
  const analytics = createAnalyticsSpy();
  const controller = createAnalyticsConsentController({
    storage: createStorage(GA4_CONSENT_STATUS.GRANTED),
    analyticsApi: analytics.api,
  });

  controller.initialize();
  controller.initialize();
  assert.deepEqual(analytics.calls, [['set', GA4_CONSENT_STATUS.GRANTED]]);
});

test('storage indisponível ou com falha mantém a aplicação funcional e a escolha na sessão', () => {
  const failingStorage = {
    getItem() {
      throw new Error('private storage detail');
    },
    setItem() {
      throw new Error('private storage detail');
    },
  };
  const analytics = createAnalyticsSpy();

  for (const storage of [null, failingStorage]) {
    const controller = createAnalyticsConsentController({ storage, analyticsApi: analytics.api });
    assert.doesNotThrow(() => controller.initialize());
    assert.doesNotThrow(() => controller.accept());
    assert.deepEqual(controller.getState(), {
      status: GA4_CONSENT_STATUS.GRANTED,
      persistence: 'session_only',
      isConsentHydrated: true,
    });
  }
});

test('readiness distingue bootstrap pendente de unknown real e decisões restauradas', () => {
  const cases = [
    [null, GA4_CONSENT_STATUS.UNKNOWN, 'not_saved'],
    [GA4_CONSENT_STATUS.GRANTED, GA4_CONSENT_STATUS.GRANTED, 'persisted'],
    [GA4_CONSENT_STATUS.DENIED, GA4_CONSENT_STATUS.DENIED, 'persisted'],
  ];

  for (const [persisted, status, persistence] of cases) {
    const controller = createAnalyticsConsentController({
      storage: createStorage(persisted),
      analyticsApi: createAnalyticsSpy().api,
    });

    assert.deepEqual(controller.getState(), {
      status: GA4_CONSENT_STATUS.UNKNOWN,
      persistence: 'unknown',
      isConsentHydrated: false,
    });
    assert.deepEqual(controller.initialize(), {
      status,
      persistence,
      isConsentHydrated: true,
    });
  }
});

test('falha da API opcional de Analytics nunca quebra a aplicação', () => {
  const throws = () => {
    throw new Error('private analytics detail');
  };
  const controller = createAnalyticsConsentController({
    storage: createStorage(),
    analyticsApi: { setConsent: throws, grantConsent: throws, denyConsent: throws },
  });

  assert.doesNotThrow(() => controller.initialize());
  assert.doesNotThrow(() => controller.accept());
  assert.doesNotThrow(() => controller.deny());
});

test('persistência contém somente chave técnica e decisão categórica, sem PII', () => {
  const storage = createStorage();
  const controller = createAnalyticsConsentController({
    storage,
    analyticsApi: createAnalyticsSpy().api,
  });

  controller.accept();
  assert.deepEqual(storage.writes, [
    [ANALYTICS_CONSENT_STORAGE_KEY, GA4_CONSENT_STATUS.GRANTED],
  ]);
  const serialized = JSON.stringify(storage.writes);
  assert.doesNotMatch(serialized, /user|email|workspace|uuid|finance|agenda|message|audio|transcript/i);
});

test('RECONSENTIMENTO A: unknown -> granted ativa GA4 sem reload', () => {
  const { controller, ga4, runtime, scripts } = createIntegratedController();

  assert.equal(controller.initialize().status, GA4_CONSENT_STATUS.UNKNOWN);
  assert.equal(scripts.length, 0);
  controller.accept();

  assert.equal(controller.getState().status, GA4_CONSENT_STATUS.GRANTED);
  assert.equal(ga4.getState().initialized, true);
  assert.equal(runtime['ga-disable-G-TEST123'], false);
  assert.equal(scripts.length, 1);
  assert.equal(ga4.trackPageView({ pathname: '/app/home' }).sent, true);
});

test('RECONSENTIMENTO B: unknown -> denied -> granted ativa GA4 sem reload', () => {
  const { controller, ga4, runtime, scripts } = createIntegratedController();

  controller.initialize();
  controller.deny();
  assert.equal(controller.getState().status, GA4_CONSENT_STATUS.DENIED);
  assert.equal(runtime['ga-disable-G-TEST123'], true);
  assert.equal(scripts.length, 0);
  assert.equal('dataLayer' in runtime, false);

  controller.accept();
  assert.equal(controller.getState().status, GA4_CONSENT_STATUS.GRANTED);
  assert.equal(runtime['ga-disable-G-TEST123'], false);
  assert.equal(ga4.getState().initialized, true);
  assert.equal(scripts.length, 1);
  assert.equal(ga4.trackPageView({ pathname: '/app/home' }).sent, true);
});

test('RECONSENTIMENTO C: granted -> denied impede qualquer novo envio', () => {
  const { controller, ga4, runtime } = createIntegratedController();

  controller.initialize();
  controller.accept();
  assert.equal(ga4.trackPageView({ pathname: '/app/home' }).sent, true);
  assert.equal(pageViewCount(runtime), 1);

  controller.deny();
  assert.equal(runtime['ga-disable-G-TEST123'], true);
  assert.equal(ga4.trackPageView({ pathname: '/app/registros' }).reason, 'blocked');
  assert.equal(pageViewCount(runtime), 1);
});

test('RECONSENTIMENTO D: granted -> denied -> granted reativa GA4 e limpa ga-disable', () => {
  const { controller, ga4, runtime, scripts } = createIntegratedController();

  controller.initialize();
  controller.accept();
  assert.equal(ga4.trackPageView({ pathname: '/app/home' }).sent, true);
  controller.deny();
  assert.equal(runtime['ga-disable-G-TEST123'], true);

  controller.accept();
  assert.equal(runtime['ga-disable-G-TEST123'], false);
  assert.equal(scripts.length, 1);
  assert.equal(ga4.trackPageView({ pathname: '/app/registros' }).sent, true);
  assert.equal(pageViewCount(runtime), 2);
});

test('Consentimento Basic usa tag gating e não emite consent default/update', () => {
  const { controller, runtime, scripts } = createIntegratedController();

  controller.initialize();
  assert.equal(scripts.length, 0);
  assert.equal('dataLayer' in runtime, false);

  controller.accept();
  controller.deny();
  controller.accept();

  const commands = (runtime.dataLayer ?? []).map((entry) => Array.from(entry));
  assert.equal(commands.some((entry) => entry[0] === 'consent'), false);
  assert.equal(commands.some((entry) => entry[0] === 'js'), true);
  assert.equal(commands.some((entry) => entry[0] === 'config'), true);
});
