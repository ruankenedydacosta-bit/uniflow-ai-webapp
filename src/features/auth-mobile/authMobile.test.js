import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AUTH_MODES,
  SOCIAL_PROVIDERS,
  WELCOME_SLIDES,
  getNextSlideIndex,
  getSocialUnavailableResult,
  normalizeAuthMode,
} from './authMobileSchema.js';
import { isValidEmail, validateAuthForm } from './authMobileValidator.js';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

test('Welcome possui as tres apresentacoes oficiais', () => {
  assert.equal(WELCOME_SLIDES.length, 3);
  assert.deepEqual(WELCOME_SLIDES.map((slide) => slide.title), [
    'Entenda sua vida financeira',
    'Converse com a Uni',
    'Organize hoje. Visualize o futuro.',
  ]);
});

test('troca entre slides respeita os limites', () => {
  assert.equal(getNextSlideIndex(0, 1), 1);
  assert.equal(getNextSlideIndex(2, 1), 2);
  assert.equal(getNextSlideIndex(0, -1), 0);
});

test('Welcome renderiza CTAs de cadastro e login', async () => {
  const contents = await source('./components/WelcomeCarousel.jsx');
  assert.match(contents, /Criar minha conta/);
  assert.match(contents, /Já tenho uma conta/);
  assert.match(contents, /onTouchStart/);
  assert.match(contents, /onTouchEnd/);
});

test('CTA Criar conta usa o modo signup da rota unica', async () => {
  const contents = await source('./pages/MobileWelcomePage.jsx');
  assert.match(contents, /\/login\?mode=signup/);
  assert.match(contents, /navigate\('\/login'\)/);
});

test('alternancia aceita somente Entrar e Criar conta', () => {
  assert.equal(normalizeAuthMode('signup'), AUTH_MODES.SIGN_UP);
  assert.equal(normalizeAuthMode('signin'), AUTH_MODES.SIGN_IN);
  assert.equal(normalizeAuthMode('unknown'), AUTH_MODES.SIGN_IN);
});

test('valida email de forma deterministica', () => {
  assert.equal(isValidEmail('pessoa@uniflow.ai'), true);
  assert.equal(isValidEmail('email-invalido'), false);
});

test('login exige email valido e senha', () => {
  const result = validateAuthForm({ email: 'invalido', password: '' }, AUTH_MODES.SIGN_IN);
  assert.equal(result.valid, false);
  assert.equal(Boolean(result.errors.email), true);
  assert.equal(Boolean(result.errors.password), true);
});

test('cadastro exige nome e senha com oito caracteres', () => {
  const result = validateAuthForm({
    fullName: '', email: 'pessoa@uniflow.ai', password: '123', acceptedTerms: true,
  }, AUTH_MODES.SIGN_UP);
  assert.equal(Boolean(result.errors.fullName), true);
  assert.equal(Boolean(result.errors.password), true);
});

test('cadastro exige aceite dos termos', () => {
  const result = validateAuthForm({
    fullName: 'Pessoa', email: 'pessoa@uniflow.ai', password: '12345678',
    acceptedTerms: false,
  }, AUTH_MODES.SIGN_UP);
  assert.equal(result.valid, false);
  assert.equal(Boolean(result.errors.acceptedTerms), true);
});

test('callback seguro do Google não autentica', () => {
  assert.deepEqual(getSocialUnavailableResult(SOCIAL_PROVIDERS.GOOGLE), {
    available: false,
    provider: 'google',
    message: 'Login com Google estará disponível em breve.',
  });
});

test('callback seguro da Apple não autentica', () => {
  assert.deepEqual(getSocialUnavailableResult(SOCIAL_PROVIDERS.APPLE), {
    available: false,
    provider: 'apple',
    message: 'Login com Apple estará disponível em breve.',
  });
});

test('autenticacao por email reutiliza exclusivamente o SessionContext', async () => {
  const contents = await source('./pages/MobileAuthPage.jsx');
  assert.match(contents, /signInWithPassword/);
  assert.match(contents, /signUpWithEmail/);
  assert.doesNotMatch(contents, /supabase|signInWithOAuth/);
});

test('mensagens de erro são humanas e não exibem detalhes internos', async () => {
  const contents = await source('./pages/MobileAuthPage.jsx');
  assert.match(contents, /Não foi possível entrar/);
  assert.match(contents, /Não foi possível criar sua conta/);
  assert.doesNotMatch(contents, /error\.message|error\.details/);
});

test('feature não contém chamadas externas ou SDK social', async () => {
  const paths = [
    './authMobileSchema.js', './authMobileValidator.js',
    './pages/MobileAuthPage.jsx', './pages/MobileWelcomePage.jsx',
    './components/SocialAuthButtons.jsx', './components/EmailAuthForm.jsx',
  ];
  const contents = (await Promise.all(paths.map(source))).join('\n');
  assert.doesNotMatch(contents, /fetch\s*\(|XMLHttpRequest|axios|signInWithOAuth/);
  assert.doesNotMatch(contents, /googleapis|appleid|client_secret|access_token/i);
});

test('rotas existentes permanecem e Welcome é pública', async () => {
  const routes = await readFile(
    new URL('../../app/routes.jsx', import.meta.url), 'utf8',
  );
  ['/welcome', '/login', '/onboarding', '/dashboard', '/uni-ai', '/financeiro'].forEach(
    (path) => assert.match(routes, new RegExp(path.replace('/', '\\/'))),
  );
});

test('sessao autenticada não retorna ao Welcome', async () => {
  const app = await readFile(new URL('../../app/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /'\/welcome'/);
  assert.match(app, /needsOnboarding \? '\/onboarding' : '\/dashboard'/);
});

test('schemas públicos permanecem imutáveis', () => {
  assert.equal(Object.isFrozen(WELCOME_SLIDES), true);
  assert.equal(Object.isFrozen(WELCOME_SLIDES[0]), true);
  assert.equal(Object.isFrozen(validateAuthForm({}, AUTH_MODES.SIGN_IN)), true);
});
