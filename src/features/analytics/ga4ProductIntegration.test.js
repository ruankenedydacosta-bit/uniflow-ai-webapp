import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const source = (relativePath) => readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(absolute);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [absolute] : [];
  }));
  return files.flat();
}

test('login e sign_up ficam depois da confirmação real e não no clique/tentativa', async () => {
  const session = await source('app/SessionContext.jsx');
  const signIn = session.slice(session.indexOf('const signInWithPassword'), session.indexOf('const signUpWithEmail'));
  const signUp = session.slice(session.indexOf('const signUpWithEmail'), session.indexOf('const signInWithGoogle'));

  assert.ok(signIn.indexOf('await signInWithPasswordService') < signIn.indexOf('trackGa4Login'));
  assert.ok(signIn.indexOf('await synchronizeSession') < signIn.indexOf('trackGa4Login'));
  assert.match(signIn, /!synchronizationResult\?\.error && synchronizationResult\?\.data/);
  assert.ok(signUp.indexOf('await signUpWithEmailService') < signUp.indexOf('trackGa4SignUp'));
  assert.match(signUp, /Array\.isArray\(signUpResult\.data\?\.user\?\.identities\)/);
  assert.match(signUp, /signUpResult\.data\.user\.identities\.length > 0/);
});

test('sign_up password exige identidade nova confirmada e falha nunca emite', async () => {
  const session = await source('app/SessionContext.jsx');
  const signUp = session.slice(session.indexOf('const signUpWithEmail'), session.indexOf('const signInWithGoogle'));
  assert.ok(signUp.indexOf('confirmedIdentityCreated') < signUp.indexOf('trackGa4SignUp'));
  assert.match(signUp, /if \(signUpResult\.error \|\| !confirmedIdentityCreated\) \{\s*return signUpResult;/);
  assert.match(signUp, /trackGa4SignUp\(GA4_AUTH_METHODS\.PASSWORD\)/);
});

test('Google OAuth confirmado produz somente login e nunca sign_up', async () => {
  const operation = await source('features/analytics/ga4AuthOperation.js');
  const redirect = await source('features/auth-mobile/useGoogleAuthRedirect.js');
  const loginPage = await source('pages/LoginPage.jsx');

  assert.match(operation, /const GOOGLE_AUTH_EVENT = GA4_PRODUCT_EVENT_NAMES\.LOGIN/);
  assert.match(operation, /return trackLogin\(GA4_AUTH_METHODS\.GOOGLE\)/);
  assert.doesNotMatch(operation, /trackGa4SignUp|GA4_PRODUCT_EVENT_NAMES\.SIGN_UP/);
  assert.match(redirect, /persistPendingGa4GoogleAuth\(GA4_PRODUCT_EVENT_NAMES\.LOGIN\)/);
  assert.doesNotMatch(loginPage, /AUTH_MODES|SIGN_UP|authEventName|mode ===/);
});

test('nenhuma heurística visual pode produzir sign_up Google', async () => {
  const operation = await source('features/analytics/ga4AuthOperation.js');
  const redirect = await source('features/auth-mobile/useGoogleAuthRedirect.js');
  const callback = await source('pages/AuthCallbackPage.jsx');
  const combined = `${operation}\n${redirect}\n${callback}`;

  assert.doesNotMatch(combined, /mode=signup|AUTH_MODES\.SIGN_UP|pathname.*SIGN_UP|searchParams.*SIGN_UP/i);
  assert.doesNotMatch(combined, /trackGa4SignUp|trackSignUp/);
});

test('voz usa o onStart canônico e lifecycle terminal deduplicado', async () => {
  const voice = await source('features/uni-voice/useUniVoiceInput.js');
  const onStart = voice.slice(voice.indexOf('onStart: () =>'), voice.indexOf('onStreamReady:'));
  assert.match(onStart, /markStarted\(sessionId\)/);
  assert.match(voice, /GA4_VOICE_RESULTS\.SUCCESS/);
  assert.match(voice, /GA4_VOICE_RESULTS\.CANCELLED/);
  assert.match(voice, /GA4_VOICE_RESULTS\.ERROR/);
  assert.doesNotMatch(voice.slice(0, voice.indexOf('const start = useCallback')), /markStarted/);
});

test('lançamento e Agenda só emitem depois da persistência confirmada e ignoram replay', async () => {
  const transactions = await source('hooks/useTransactions.js');
  const conversation = await source('features/uni-conversation/useUniConversation.js');
  const agendaHook = await source('hooks/useAgenda.js');
  const agendaFlow = await source('features/uni-conversation/agendaConversationFlow.js');

  assert.match(transactions, /confirmed: !transactionId\s*&& isSupabaseConfigured\s*&& !result\?\.error/);
  assert.match(conversation, /idempotentReplay: result\.data\.idempotent_replay !== false/);
  assert.match(agendaHook, /idempotentReplay: result\?\.idempotentReplay === true/);
  assert.match(agendaFlow, /idempotentReplay: result\?\.idempotentReplay === true/);
});

test('gtag/dataLayer permanecem centralizados na camada Analytics', async () => {
  const srcRoot = new URL('../../', import.meta.url).pathname;
  const files = await listJavaScriptFiles(srcRoot);
  const violations = [];
  for (const file of files) {
    if (file.includes('/features/analytics/')) continue;
    const content = await readFile(file, 'utf8');
    if (/\bgtag\s*\(|\bdataLayer\b|googletagmanager\.com/.test(content)) {
      violations.push(path.relative(srcRoot, file));
    }
  }
  assert.deepEqual(violations, []);
});

test('cadastro visualizado é emitido somente pelo modo signup efetivamente renderizado', async () => {
  const mobileAuth = await source('features/auth-mobile/pages/MobileAuthPage.jsx');
  const routes = await source('app/routes.jsx');

  assert.match(mobileAuth, /createGa4SignUpViewedLifecycle/);
  assert.match(mobileAuth, /useAnalyticsConsent/);
  assert.match(mobileAuth, /update\(mode === AUTH_MODES\.SIGN_UP, \{/);
  assert.match(mobileAuth, /consentReady: isConsentHydrated/);
  assert.match(mobileAuth, /consentStatus: analyticsConsentStatus/);
  assert.doesNotMatch(routes, /trackGa4SignUpViewed|sign_up_viewed/);
});

test('funil comercial emite somente nos cliques canônicos e não no pageview ou radio', async () => {
  const plan = await source('features/personal-plan/PersonalPlanPage.jsx');
  const beginHandler = plan.slice(plan.indexOf('function handleBeginCheckout'), plan.indexOf('function handleCloseCheckout'));
  const confirmHandler = plan.slice(plan.indexOf('async function handleConfirmSubscription'), plan.indexOf('function handleGoHome'));

  assert.match(beginHandler, /checkoutEventLifecycle\.begin\(\)/);
  assert.match(confirmHandler, /checkoutEventLifecycle\.confirmPaymentMethod\(paymentMethod\)/);
  assert.match(plan, /onClick=\{handleBeginCheckout\}/);
  assert.doesNotMatch(plan, /onChange=\{\(\) =>[^}]*trackGa4|onChange=\{[^}]*confirmPaymentMethod/);
  assert.doesNotMatch(plan, /pix_generated|add_payment_info|purchase|subscription_activated/);
});
