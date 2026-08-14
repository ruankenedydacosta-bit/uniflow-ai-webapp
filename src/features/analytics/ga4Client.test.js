import assert from 'node:assert/strict';
import test from 'node:test';
import { createGa4Client } from './ga4Client.js';

const ENABLED_ENV = Object.freeze({
  VITE_GA4_ENABLED: 'true',
  VITE_GA4_MEASUREMENT_ID: 'G-TEST123',
});

function createRuntime({
  href = 'https://app.invalid/app/home',
  appendError = null,
} = {}) {
  const scripts = [];
  const elements = new Map();
  const location = new URL(href);
  const runtime = {
    location,
    document: {
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
