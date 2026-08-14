import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('banner exige escolha explícita e oferece aceitar/recusar sem fechamento implícito', async () => {
  const banner = await source('./AnalyticsConsentBanner.jsx');

  assert.match(banner, /status !== GA4_CONSENT_STATUS\.UNKNOWN/);
  assert.match(banner, /onClick=\{accept\}[\s\S]*?Aceitar Analytics/);
  assert.match(banner, /onClick=\{deny\}[\s\S]*?Recusar Analytics/);
  assert.doesNotMatch(banner, /onClose|closeButton|Fechar|dismiss|continuar.*consent/i);
  assert.doesNotMatch(banner, /useSession|supabase|workspace|user\??\.|email/);
});

test('preferência posterior fica em Conta e reutiliza Modal/Button existentes', async () => {
  const account = await source('../simplified-app/SimplifiedAccountPage.jsx');
  const modal = await source('./AnalyticsConsentPreferencesModal.jsx');

  assert.match(account, /title: 'Privacidade e Analytics'/);
  assert.match(account, /setShowAnalyticsPreferences\(true\)/);
  assert.match(account, /<AnalyticsConsentPreferencesModal/);
  assert.match(modal, /import Button from '\.\.\/\.\.\/components\/ui\/Button\/Button\.jsx';/);
  assert.match(modal, /import Modal from '\.\.\/\.\.\/components\/ui\/Modal\/Modal\.jsx';/);
  assert.match(modal, /aria-pressed=\{status === GA4_CONSENT_STATUS\.GRANTED\}/);
  assert.match(modal, /aria-pressed=\{status === GA4_CONSENT_STATUS\.DENIED\}/);
});

test('bootstrap inicializa configuração antes de restaurar consentimento', async () => {
  const main = await source('../../main.jsx');
  const ga4Index = main.indexOf('initializeGa4();');
  const consentIndex = main.indexOf('initializeAnalyticsConsent();');
  const telemetryIndex = main.indexOf('initializeTelemetry();');

  assert.ok(ga4Index >= 0);
  assert.ok(consentIndex > ga4Index);
  assert.ok(telemetryIndex > consentIndex);
});

test('banner global está dentro do BrowserRouter e separado de sessão/Supabase', async () => {
  const app = await source('../../app/App.jsx');
  const routerStart = app.indexOf('<BrowserRouter>');
  const banner = app.indexOf('<AnalyticsConsentBanner />');
  const session = app.indexOf('<SessionProvider>');

  assert.ok(routerStart >= 0 && banner > routerStart && session > banner);
});

test('camada de consentimento não acessa Supabase, observabilidade ou dados de produto', async () => {
  const files = await Promise.all([
    source('./analyticsConsentStorage.js'),
    source('./analyticsConsentController.js'),
    source('./useAnalyticsConsent.js'),
    source('./AnalyticsConsentBanner.jsx'),
    source('./AnalyticsConsentPreferencesModal.jsx'),
  ]);
  const implementation = files.join('\n');

  assert.doesNotMatch(implementation, /from ['"][^'"]*supabase|useSession|workspace_id|user_id|observability|Sentry/i);
  assert.doesNotMatch(implementation, /localStorage\.(?:setItem|getItem)/);
  assert.match(implementation, /uniflow:analytics-consent:v1/);
});

test('consentimento não toca em URL, query string ou linker cross-domain', async () => {
  const files = await Promise.all([
    source('./analyticsConsentStorage.js'),
    source('./analyticsConsentController.js'),
    source('./useAnalyticsConsent.js'),
    source('./AnalyticsConsentBanner.jsx'),
    source('./AnalyticsConsentPreferencesModal.jsx'),
  ]);
  const implementation = files.join('\n');

  assert.doesNotMatch(implementation, /_gl|location\.(?:search|hash)|URLSearchParams|history\.(?:pushState|replaceState)/);
});
