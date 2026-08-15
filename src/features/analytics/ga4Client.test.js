import assert from 'node:assert/strict';
import test from 'node:test';
import { createGa4Client } from './ga4Client.js';

const ENABLED_ENV = Object.freeze({
  VITE_GA4_ENABLED: 'true',
  VITE_GA4_MEASUREMENT_ID: 'G-TEST123',
});

function createRuntime({
  href = 'https://app.invalid/app/home',
  referrer = '',
  appendError = null,
} = {}) {
  const scripts = [];
  const elements = new Map();
  const location = new URL(href);
  const runtime = {
    location,
    document: {
      referrer,
      createElement: () => ({}),
      getElementById: (id) => elements.get(id) ?? null,
      head: {
        appendChild(script) {
          if (appendError) throw appendError;
          scripts.push(script);
          if (script.id) elements.set(script.id, script);
          return script;
        },
      },
    },
  };

  return { runtime, scripts };
}

function commands(runtime) {
  return (runtime.dataLayer ?? []).map((entry) => Array.from(entry));
}

function pageViewCommands(runtime) {
  return commands(runtime).filter((entry) => entry[0] === 'event' && entry[1] === 'page_view');
}

function productEventCommands(runtime) {
  return commands(runtime).filter((entry) => entry[0] === 'event' && entry[1] !== 'page_view');
}

test('GA4 desativado não cria script, gtag ou dataLayer', () => {
  const { runtime, scripts } = createRuntime();
  const client = createGa4Client({ runtime });

  client.initialize({
    VITE_GA4_ENABLED: 'false',
    VITE_GA4_MEASUREMENT_ID: 'G-TEST123',
  });
  client.grantConsent();

  assert.equal(scripts.length, 0);
  assert.equal('gtag' in runtime, false);
  assert.equal('dataLayer' in runtime, false);
  assert.equal(client.getState().enabled, false);
});

test('Measurement ID ausente mantém integração bloqueada', () => {
  const { runtime, scripts } = createRuntime();
  const client = createGa4Client({ runtime });

  client.initialize({ VITE_GA4_ENABLED: 'true' });
  client.grantConsent();

  assert.equal(scripts.length, 0);
  assert.equal('dataLayer' in runtime, false);
  assert.equal(client.getState().loadStatus, 'missing_configuration');
});

test('ausência de consentimento não carrega Google Tag nem cria fila', () => {
  const { runtime, scripts } = createRuntime();
  const client = createGa4Client({ runtime });

  client.initialize(ENABLED_ENV);
  const result = client.trackPageView({ pathname: '/app/home' });

  assert.equal(result.reason, 'blocked');
  assert.equal(scripts.length, 0);
  assert.equal('gtag' in runtime, false);
  assert.equal('dataLayer' in runtime, false);
  assert.equal(client.getState().consent, 'unknown');
});

test('consentimento explícito ativa uma única inicialização com send_page_view false', () => {
  const { runtime, scripts } = createRuntime();
  const client = createGa4Client({ runtime });

  client.initialize(ENABLED_ENV);
  client.initialize(ENABLED_ENV);
  client.grantConsent();
  client.grantConsent();
  client.initialize(ENABLED_ENV);

  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].async, true);
  assert.equal(scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-TEST123');
  assert.equal(commands(runtime).filter((entry) => entry[0] === 'config').length, 1);
  assert.deepEqual(commands(runtime).find((entry) => entry[0] === 'config').slice(1), [
    'G-TEST123',
    { send_page_view: false },
  ]);
});

test('pageview é manual e o mesmo pathname consecutivo é deduplicado', () => {
  const { runtime } = createRuntime();
  const client = createGa4Client({ runtime });
  client.initialize(ENABLED_ENV);
  client.grantConsent();

  assert.equal(client.trackPageView({ pathname: '/app/home' }).sent, true);
  assert.equal(client.trackPageView({ pathname: '/app/home' }).reason, 'duplicate');
  assert.equal(client.trackPageView({ pathname: '/app/home?view=other#section' }).reason, 'duplicate');
  assert.equal(client.trackPageView({ pathname: '/app/registros' }).sent, true);
  assert.equal(pageViewCommands(runtime).length, 2);
});

test('dupla execução equivalente ao StrictMode não duplica script nem pageview', () => {
  const { runtime, scripts } = createRuntime();
  const client = createGa4Client({ runtime });

  client.initialize(ENABLED_ENV);
  client.initialize(ENABLED_ENV);
  client.grantConsent();
  client.trackPageView({ pathname: '/welcome' });
  client.trackPageView({ pathname: '/welcome' });

  assert.equal(scripts.length, 1);
  assert.equal(pageViewCommands(runtime).length, 1);
});

test('redirect intermediário, rota proibida e rota desconhecida não são contados', () => {
  const { runtime } = createRuntime();
  const client = createGa4Client({ runtime });
  client.initialize(ENABLED_ENV);
  client.grantConsent();

  assert.equal(client.trackPageView({ pathname: '/' }).reason, 'excluded');
  assert.equal(client.trackPageView({ pathname: '/cadastro' }).reason, 'excluded');
  assert.equal(client.trackPageView({ pathname: '/auth/callback?code=secret' }).reason, 'excluded');
  assert.equal(client.trackPageView({ pathname: '/redefinir-senha#access_token=secret' }).reason, 'excluded');
  assert.equal(client.trackPageView({ pathname: '/dashboard' }).reason, 'excluded');
  assert.equal(pageViewCommands(runtime).length, 0);

  assert.equal(client.trackPageView({ pathname: '/login' }).sent, true);
  assert.equal(pageViewCommands(runtime).length, 1);
});

test('_gl permanece na URL para o linker, mas nunca entra no evento', () => {
  const initialHref = 'https://app.invalid/app/home?_gl=linker-secret&code=oauth-secret#token';
  const { runtime } = createRuntime({ href: initialHref });
  const client = createGa4Client({ runtime });
  client.initialize(ENABLED_ENV);

  assert.equal(runtime.location.href, initialHref);
  client.grantConsent();
  client.trackPageView({
    pathname: '/app/home?_gl=linker-secret&code=oauth-secret#token',
  });

  assert.equal(runtime.location.href, initialHref);
  const serialized = JSON.stringify(pageViewCommands(runtime));
  assert.doesNotMatch(serialized, /_gl|linker-secret|oauth-secret|code|token/);
  assert.match(serialized, /https:\/\/app\.invalid\/app\/home/);
});

test('PII e conteúdo do usuário presentes na query nunca chegam ao payload público', () => {
  const { runtime } = createRuntime();
  const client = createGa4Client({ runtime });
  client.initialize(ENABLED_ENV);
  client.grantConsent();
  client.trackPageView({
    pathname: '/app/registros?email=pessoa@example.com&amount=999&message=segredo&transcript=fala',
  });

  const serialized = JSON.stringify(pageViewCommands(runtime));
  assert.doesNotMatch(serialized, /pessoa|example|999|segredo|fala|email|amount|message|transcript/);
  assert.match(serialized, /Registros/);
});

test('eventos de produto recebem page_location canônico sem query, hash ou _gl', () => {
  const cases = [
    {
      href: 'https://app.invalid/login?mode=signup',
      eventName: 'sign_up_viewed',
      params: {},
      expectedLocation: 'https://app.invalid/login',
    },
    {
      href: 'https://app.invalid/login?mode=signup#teste',
      eventName: 'login',
      params: { method: 'password' },
      expectedLocation: 'https://app.invalid/login',
    },
    {
      href: 'https://app.invalid/welcome?_gl=TEST#cross-domain',
      eventName: 'login',
      params: { method: 'google' },
      expectedLocation: 'https://app.invalid/welcome',
    },
    {
      href: 'https://app.invalid/auth/callback?code=SECRET&state=SECRET#token',
      eventName: 'login',
      params: { method: 'google' },
      expectedLocation: 'https://app.invalid/auth/callback',
    },
    {
      href: 'https://app.invalid/plano-pessoal/retorno?status=success#payment',
      eventName: 'begin_checkout',
      params: {},
      expectedLocation: 'https://app.invalid/plano-pessoal/retorno',
    },
  ];

  for (const testCase of cases) {
    const { runtime } = createRuntime({ href: testCase.href });
    const client = createGa4Client({ runtime });
    client.initialize(ENABLED_ENV);
    client.grantConsent();

    assert.equal(client.trackProductEvent(testCase.eventName, testCase.params).sent, true);
    const payload = productEventCommands(runtime)[0][2];
    assert.equal(payload.page_location, testCase.expectedLocation);
    assert.doesNotMatch(JSON.stringify(payload), /[?#]|_gl|mode|code|state|status|SECRET|TEST|token|payment/);
    assert.equal(runtime.location.href, testCase.href);
  }
});

test('todos os nove eventos usam o mesmo contexto URL seguro central', () => {
  const eventCases = [
    ['login', { method: 'password' }],
    ['sign_up', { method: 'password' }],
    ['sign_up_viewed', {}],
    ['voice_started', { interaction_mode: 'voice_button' }],
    ['voice_completed', { result: 'success', interaction_mode: 'voice_button' }],
    ['transaction_created', { direction: 'entry', origin: 'manual' }],
    ['calendar_event_created', { origin: 'voice', schedule_kind: 'timed' }],
    ['begin_checkout', {}],
    ['payment_method_selected', { payment_type: 'pix' }],
  ];
  const { runtime } = createRuntime({
    href: 'https://app.invalid/app/home?email=pessoa@example.com&amount=999#transcript',
  });
  const client = createGa4Client({ runtime });
  client.initialize(ENABLED_ENV);
  client.grantConsent();

  for (const [eventName, params] of eventCases) {
    assert.equal(client.trackProductEvent(eventName, params).sent, true, eventName);
  }

  assert.equal(productEventCommands(runtime).length, eventCases.length);
  for (const command of productEventCommands(runtime)) {
    assert.equal(command[2].page_location, 'https://app.invalid/app/home');
    assert.doesNotMatch(JSON.stringify(command[2]), /pessoa|example|999|transcript|email|amount/);
  }
});

test('page_referrer válido é canonicalizado e ausência permanece ausente', () => {
  const { runtime } = createRuntime({
    href: 'https://app.invalid/login?mode=signup',
    referrer: 'https://www.uniflow-ai.com.br/oferta?utm_source=secret#fragment',
  });
  const client = createGa4Client({ runtime });
  client.initialize(ENABLED_ENV);
  client.grantConsent();
  client.trackProductEvent('sign_up_viewed', {});
  client.trackPageView({ pathname: '/login' });

  assert.equal(productEventCommands(runtime)[0][2].page_referrer, 'https://www.uniflow-ai.com.br/oferta');
  assert.equal(pageViewCommands(runtime)[0][2].page_referrer, 'https://www.uniflow-ai.com.br/oferta');
  assert.doesNotMatch(JSON.stringify(commands(runtime)), /utm_source|secret|fragment/);

  const noReferrerRuntime = createRuntime().runtime;
  const noReferrerClient = createGa4Client({ runtime: noReferrerRuntime });
  noReferrerClient.initialize(ENABLED_ENV);
  noReferrerClient.grantConsent();
  noReferrerClient.trackProductEvent('login', { method: 'password' });
  assert.equal('page_referrer' in productEventCommands(noReferrerRuntime)[0][2], false);
});

test('location ou referrer inválido descarta a emissão sem quebrar a aplicação', () => {
  const invalidLocation = createRuntime().runtime;
  invalidLocation.location = { href: 'javascript:alert(1)' };
  const locationClient = createGa4Client({ runtime: invalidLocation });
  locationClient.initialize(ENABLED_ENV);
  locationClient.grantConsent();
  assert.doesNotThrow(() => locationClient.trackProductEvent('login', { method: 'password' }));
  assert.equal(locationClient.trackProductEvent('login', { method: 'password' }).reason, 'unsafe_context');
  assert.equal(productEventCommands(invalidLocation).length, 0);

  const invalidReferrer = createRuntime({ referrer: 'not a valid referrer?token=SECRET' }).runtime;
  const referrerClient = createGa4Client({ runtime: invalidReferrer });
  referrerClient.initialize(ENABLED_ENV);
  referrerClient.grantConsent();
  assert.equal(referrerClient.trackProductEvent('login', { method: 'password' }).reason, 'unsafe_context');
  assert.equal(productEventCommands(invalidReferrer).length, 0);
});

test('falha de DOM é fail-open e nunca lança erro para a aplicação', () => {
  const { runtime } = createRuntime({ appendError: new Error('network private detail') });
  const client = createGa4Client({ runtime });

  assert.doesNotThrow(() => client.initialize(ENABLED_ENV));
  assert.doesNotThrow(() => client.grantConsent());
  assert.equal(client.getState().initialized, false);
  assert.equal(client.getState().loadStatus, 'failed');
  assert.equal(client.trackPageView({ pathname: '/app/home' }).sent, false);
  assert.doesNotMatch(JSON.stringify(client.getState()), /private detail/);
});
