import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');

test('bootstrap global inicializa GA4 pela camada dedicada', async () => {
  const main = await source('../../main.jsx');
  assert.match(main, /import \{ initializeGa4 \} from '.\/features\/analytics\/ga4Client\.js';/);
  assert.match(main, /initializeGa4\(\);/);
});

test('tracker usa somente pathname e permanece dentro do BrowserRouter', async () => {
  const [app, tracker] = await Promise.all([
    source('../../app/App.jsx'),
    source('./ga4RouteTracker.jsx'),
  ]);

  assert.match(app, /<BrowserRouter>[\s\S]*<AppContent \/>[\s\S]*<\/BrowserRouter>/);
  assert.equal((app.match(/<Ga4RouteTracker \/>/g) ?? []).length, 3);
  assert.match(tracker, /const \{ pathname \} = useLocation\(\);/);
  assert.doesNotMatch(tracker, /location\.search|location\.hash|useSearchParams/);
});

test('tracker é montado somente depois dos guards que podem redirecionar', async () => {
  const app = await source('../../app/App.jsx');
  const publicGuard = app.indexOf("if (isPublicRoute)");
  const authenticatedRedirect = app.indexOf("if (!session || sessionError)");
  const firstTracker = app.indexOf('<Ga4RouteTracker />');
  const standaloneTracker = app.indexOf('<Ga4RouteTracker />', firstTracker + 1);

  assert.ok(publicGuard >= 0 && firstTracker > publicGuard);
  assert.ok(authenticatedRedirect >= 0 && standaloneTracker > authenticatedRedirect);
  assert.match(app, /if \(activeRoute\?\.standalone\) \{[\s\S]*?<Ga4RouteTracker \/>/);
  assert.match(app, /if \(activeRoute\?\.simplified\) \{[\s\S]*?<Ga4RouteTracker \/>/);
});

test('camada Analytics não importa Supabase, observabilidade ou eventos de produto', async () => {
  const [client, contracts, tracker] = await Promise.all([
    source('./ga4Client.js'),
    source('./ga4Contracts.js'),
    source('./ga4RouteTracker.jsx'),
  ]);
  const analyticsSource = `${client}\n${contracts}\n${tracker}`;

  assert.doesNotMatch(analyticsSource, /supabase|observability|sentry/i);
  assert.doesNotMatch(
    analyticsSource,
    /login'\)|sign_up|app_open|voice_started|voice_completed|transaction_created|calendar_event_created|category_created|notification_opened|first_value_reached/,
  );
  assert.equal((client.match(/'page_view'/g) ?? []).length, 1);
});

test('exemplo de ambiente documenta feature flag desligada e ID vazio', async () => {
  const envExample = await source('../../../.env.example');
  assert.match(envExample, /^VITE_GA4_ENABLED=false$/m);
  assert.match(envExample, /^VITE_GA4_MEASUREMENT_ID=$/m);
});
