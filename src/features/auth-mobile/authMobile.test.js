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

// ============================================================================
// AUTH1 -- recuperação de senha real
// ============================================================================

test('/redefinir-senha e uma rota publica (fora do layout autenticado), sem exigir onboarding/workspace', async () => {
  const routes = await readFile(new URL('../../app/routes.jsx', import.meta.url), 'utf8');
  assert.match(routes, /import ResetPasswordPage from '\.\.\/pages\/ResetPasswordPage';/);
  const publicBlock = routes.slice(routes.indexOf('export const publicRoutes'), routes.indexOf('export const appRoutes'));
  assert.match(publicBlock, /path: '\/redefinir-senha',/);
  assert.match(publicBlock, /element: <ResetPasswordPage \/>,/);
  const appBlock = routes.slice(routes.indexOf('export const appRoutes'));
  assert.doesNotMatch(appBlock, /\/redefinir-senha/);
});

test('MobileAuthPage abre um fluxo real de recuperacao (nao mais um placeholder "estará disponível em breve")', async () => {
  const contents = await source('./pages/MobileAuthPage.jsx');
  assert.doesNotMatch(contents, /A recuperação de senha estará disponível em breve\./);
  assert.match(contents, /import ForgotPasswordForm from '\.\.\/components\/ForgotPasswordForm\.jsx';/);
  assert.match(contents, /onForgotPassword=\{handleOpenForgotPassword\}/);
});

test('handleOpenForgotPassword reaproveita o e-mail ja digitado no login', async () => {
  const contents = await source('./pages/MobileAuthPage.jsx');
  const fnBody = contents.slice(contents.indexOf('function handleOpenForgotPassword'), contents.indexOf('function handleBackToLogin'));
  assert.match(fnBody, /setForgotPasswordEmail\(email \|\| ''\);/);
});

test('EmailAuthForm repassa o e-mail digitado para onForgotPassword (nao chama sem argumento)', async () => {
  const contents = await source('./components/EmailAuthForm.jsx');
  assert.match(contents, /onClick=\{\(\) => onForgotPassword\(values\.email\)\}/);
});

test('solicitacao de reset usa useSession().requestPasswordReset -- nunca chama Supabase/authService diretamente no componente', async () => {
  const contents = await source('./pages/MobileAuthPage.jsx');
  assert.match(contents, /requestPasswordReset,/);
  const fnBody = contents.slice(contents.indexOf('async function handleRequestPasswordReset'), contents.indexOf('async function handleSocial'));
  assert.match(fnBody, /const result = await requestPasswordReset\(email\);/);
  assert.doesNotMatch(fnBody, /supabase|authService/i);
});

test('duplo clique na solicitacao de reset e bloqueado por trava sincrona (resetRequestRef)', async () => {
  const contents = await source('./pages/MobileAuthPage.jsx');
  assert.match(contents, /const resetRequestRef = useRef\(false\);/);
  const fnBody = contents.slice(contents.indexOf('async function handleRequestPasswordReset'), contents.indexOf('async function handleSocial'));
  assert.match(fnBody, /if \(resetRequestRef\.current\) return;/);
  assert.match(fnBody, /resetRequestRef\.current = true;/);
  assert.match(fnBody, /resetRequestRef\.current = false;/);
});

test('mensagem de sucesso da solicitacao e sempre a mensagem neutra (getPasswordResetRequestFeedback) -- nunca revela se a conta existe', async () => {
  const contents = await source('./pages/MobileAuthPage.jsx');
  assert.match(contents, /import \{ getPasswordResetRequestFeedback \} from '\.\.\/passwordRecoveryUtils\.js';/);
  assert.match(contents, /setResetFeedback\(getPasswordResetRequestFeedback\(result\?\.error\)\);/);
});

test('"Voltar ao login" (handleBackToLogin) fecha o fluxo de recuperacao e nao dispara mutacao', async () => {
  const contents = await source('./pages/MobileAuthPage.jsx');
  assert.match(contents, /function handleBackToLogin\(\) \{\s*\n\s*if \(isRequestingReset\) return;\s*\n\s*setIsForgotPasswordOpen\(false\);/);
});

test('mensagem apos redefinir senha (location.state.passwordUpdated) reaproveita o mecanismo de feedback ja existente', async () => {
  const contents = await source('./pages/MobileAuthPage.jsx');
  assert.match(contents, /location\.state\?\.passwordUpdated \? 'Senha atualizada\. Entre com sua nova senha\.' : ''/);
});

test('login social continua "Em breve" -- AUTH1 nao implementou login social', async () => {
  const contents = await source('./pages/MobileAuthPage.jsx');
  assert.match(contents, /getSocialUnavailableResult/);
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
