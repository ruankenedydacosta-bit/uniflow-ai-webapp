import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('banner exige escolha explícita e oferece aceitar/recusar sem fechamento implícito', async () => {
  const banner = await source('./AnalyticsConsentBanner.jsx');

  assert.match(banner, /status !== GA4_CONSENT_STATUS\.UNKNOWN/);
  assert.match(banner, /onClick=\{accept\}[\s\S]*?Permitir/);
  assert.match(banner, /onClick=\{deny\}[\s\S]*?Não permitir/);
  assert.match(banner, /Privacidade e melhoria do app/);
  assert.match(banner, /dados financeiros, mensagens, áudios ou transcrições/);
  assert.doesNotMatch(banner, /Aceitar Analytics|Recusar Analytics/);
  assert.doesNotMatch(banner, /onClose|closeButton|Fechar|dismiss|continuar.*consent/i);
  assert.doesNotMatch(banner, /useSession|supabase|workspace|user\??\.|email/);
});

test('banner reutiliza o design system com layout compacto, safe-area e movimento reduzido', async () => {
  const [banner, css] = await Promise.all([
    source('./AnalyticsConsentBanner.jsx'),
    source('./analyticsConsent.module.css'),
  ]);

  assert.match(banner, /import \{ LockIcon \} from '\.\.\/simplified-app\/SimplifiedIcons\.jsx';/);
  assert.match(banner, /aria-labelledby="analytics-consent-title"/);
  assert.match(banner, /aria-describedby="analytics-consent-description"/);
  assert.match(css, /var\(--uf-gradient-hairline\)/);
  assert.match(css, /var\(--uf-gray-950\)/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /min-height:\s*var\(--uf-tap-target-min\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation:\s*none/);
  assert.match(css, /body:not\(\[data-simplified-app-mounted='true'\]\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
});

test('preferência posterior fica em Conta e reutiliza Modal/Button existentes', async () => {
  const account = await source('../simplified-app/SimplifiedAccountPage.jsx');
  const modal = await source('./AnalyticsConsentPreferencesModal.jsx');

  assert.match(account, /title: 'Privacidade e Analytics'/);
  assert.match(account, /setShowAnalyticsPreferences\(true\)/);
  assert.match(account, /<AnalyticsConsentPreferencesModal/);
  assert.match(modal, /import Button from '\.\.\/\.\.\/components\/ui\/Button\/Button\.jsx';/);
  assert.match(modal, /import Modal from '\.\.\/\.\.\/components\/ui\/Modal\/Modal\.jsx';/);
  assert.match(modal, /title="Privacidade e melhoria do app"/);
  assert.match(modal, /onClick=\{accept\}[\s\S]*?Permitir/);
  assert.match(modal, /onClick=\{deny\}[\s\S]*?Não permitir/);
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
