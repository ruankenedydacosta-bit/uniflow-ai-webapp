import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AUTH_MODES,
  SOCIAL_PROVIDERS,
  getGoogleAuthFeedback,
  getSocialUnavailableResult,
  normalizeAuthMode,
} from './authMobileSchema.js';
import { isValidEmail, validateAuthForm } from './authMobileValidator.js';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

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
    './pages/MobileAuthPage.jsx',
    './components/SocialAuthButtons.jsx', './components/EmailAuthForm.jsx',
  ];
  const contents = (await Promise.all(paths.map(source))).join('\n');
  assert.doesNotMatch(contents, /fetch\s*\(|XMLHttpRequest|axios|signInWithOAuth/);
  assert.doesNotMatch(contents, /googleapis|appleid|client_secret|access_token/i);
});

// IDENTIDADE AUTH V2: as duas marcas passaram de PNG para vetor inline. Os
// PNGs eram mockups (logo numa parede) com fundo cinza OPACO e slogan em
// cinza-escuro -- sobre o fundo #020713 da página, a única saída era
// recortar a imagem, e o recorte comia o slogan e o "TECHNOLOGY MONITORING".
// O nome acessível de cada marca continua idêntico, agora via aria-label.
test('experiência institucional desenha as duas marcas em vetor, sem PNG recortado', async () => {
  const contents = await source('./components/AuthBrandExperience.jsx');
  // Nenhum import de imagem: a regra é sobre o que o componente CARREGA,
  // não sobre citar os nomes dos PNGs antigos no comentário histórico.
  assert.doesNotMatch(contents, /^\s*import\s+.*\.(png|jpe?g|svg|webp)['"]/m);
  assert.doesNotMatch(contents, /<img\b/);
  assert.doesNotMatch(contents, /icones_quatros_beneficios|onda_luminosa/);
  assert.match(contents, /aria-label="UniFlow AI — Conectando você às melhores decisões financeiras\."/);
  assert.match(contents, /aria-label="SmartTech"/);
  // O slogan e a assinatura da parceria são TEXTO -- nunca mais pixels que
  // possam ser cortados por overflow.
  assert.match(contents, /Conectando você às <em>melhores decisões financeiras\.<\/em>/);
  assert.match(contents, /TECHNOLOGY MONITORING/);
});

// Fase 3 do redesign (#90): a tela de acesso segue a tela 15 do handoff --
// orb de 132px, "UniFlow" e um apoio por modo. Entrar e criar conta
// compartilham a mesma composição; a troca entre os dois é o link do
// rodapé ("Ainda não tem conta? Criar conta" / "Já tem conta? Entrar").
test('login e cadastro compartilham a mesma composição (orb + UniFlow + apoio por modo), com o link de troca no rodapé', async () => {
  const contents = await source('./pages/MobileAuthPage.jsx');
  assert.match(contents, /<UniRingOrb size=\{132\} \/>/);
  assert.match(contents, /<h1 id="auth-title" className=\{styles\.brandName\}>UniFlow<\/h1>/);
  assert.match(contents, /isSignUp \? 'Crie sua conta' : 'Entre para continuar'/);
  assert.match(contents, /\? 'Recuperar senha'/);
  assert.match(contents, /isSignUp \? 'Já tem conta\? ' : 'Ainda não tem conta\? '/);
  assert.match(contents, /isSignUp \? 'Entrar' : 'Criar conta'/);
  assert.match(contents, /ensureAppFont\(document\)/);
  assert.doesNotMatch(contents, /AuthBrandExperience|PartnershipFooter|AuthModeSwitch/);
});

test('benefícios e onda luminosa são construídos em SVG e CSS', async () => {
  const contents = await source('./components/AuthBrandExperience.jsx');
  [
    'Segurança de ponta',
    'Insights inteligentes',
    'Organize suas finanças',
    'IA que trabalha por você',
  ].forEach((label) => assert.match(contents, new RegExp(label)));
  assert.match(contents, /<svg viewBox="0 0 720 150"/);
  assert.match(contents, /<linearGradient/);
  assert.match(contents, /useId\(\)/);
  // A onda é composta (halo difuso + filetes + feixe principal + núcleo),
  // não um traço único -- é a soma das camadas que produz o fluxo de luz.
  ['waveHalo', 'waveStrands', 'wavePrimary', 'waveCore'].forEach((layer) => {
    assert.match(contents, new RegExp(`styles\\.${layer}`), `camada ${layer} ausente`);
  });
  assert.match(contents, /styles\.particleField/);
});

test('cadastro segue para a apresentação sem redirecionar ao onboarding antigo', async () => {
  const contents = await source('./pages/MobileAuthPage.jsx');
  assert.match(contents, /const POST_SIGN_UP_DESTINATION = PRESENTATION_ROUTE;/);
  assert.doesNotMatch(contents, /navigate\([^)]*\/onboarding/);
});

test('autenticação não inclui perguntas antigas de reconhecimento ou perfil', async () => {
  const contents = await source('./pages/MobileAuthPage.jsx');
  assert.doesNotMatch(contents, /reconhecimento|Pessoa Física|Pessoa Jurídica|PF\/PJ|Qual é o seu objetivo/i);
});

test('estrutura visual preserva responsividade, safe area e redução de movimento', async () => {
  const css = await source('./authMobile.module.css');
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /@media \(max-width: 359px\)/);
  assert.match(css, /@media \(min-width: 768px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /overflow-x: hidden/);
});

test('rotas existentes permanecem e /welcome é a tela de decisão (Já tenho conta / Criar conta)', async () => {
  const routes = await readFile(
    new URL('../../app/routes.jsx', import.meta.url), 'utf8',
  );
  ['/welcome', '/login', '/cadastro', '/dashboard', '/uni-ai', '/financeiro'].forEach(
    (path) => assert.match(routes, new RegExp(path.replace('/', '\\/'))),
  );
  const welcomeRoute = routes.slice(
    routes.indexOf("path: '/welcome'"),
    routes.indexOf("path: '/login'"),
  );
  assert.match(welcomeRoute, /<WelcomeDecisionPage \/>/);
  assert.doesNotMatch(routes, /MobileWelcomePage|WelcomeCarousel|OnboardingPage/);
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
  assert.match(contents, /location\.state\?\.passwordUpdated\s*\n\s*\? 'Senha atualizada\. Entre com sua nova senha\.'\s*\n\s*: initialFeedback/);
});

test('Apple foi removido completamente da interface de autenticação', async () => {
  const page = await source('./pages/MobileAuthPage.jsx');
  const buttons = await source('./components/SocialAuthButtons.jsx');
  assert.doesNotMatch(page, /onAppleAuth|SOCIAL_PROVIDERS\.APPLE/);
  assert.doesNotMatch(buttons, /Apple|onAppleAuth|socialMark}>A/);
});

test('handleGoogleAuth usa loading dedicado somente no fluxo Google', async () => {
  const contents = await source('./pages/MobileAuthPage.jsx');
  const fnBody = contents.slice(
    contents.indexOf('async function handleGoogleAuth'),
    contents.indexOf('async function handleEmailSubmit'),
  );
  assert.match(fnBody, /setIsGoogleLoading\(true\);/);
  assert.match(fnBody, /setIsGoogleLoading\(false\);/);
});

test('handleGoogleAuth sem handler usa feedback seguro sem chamar provedor', async () => {
  const contents = await source('./pages/MobileAuthPage.jsx');
  const fnBody = contents.slice(
    contents.indexOf('async function handleGoogleAuth'),
    contents.indexOf('async function handleEmailSubmit'),
  );
  assert.match(fnBody, /if \(typeof onGoogleAuth !== 'function'\)/);
  assert.match(fnBody, /getGoogleAuthFeedback/);
});

test('handleGoogleAuth respeita mensagem vazia de sucesso', async () => {
  const contents = await source('./pages/MobileAuthPage.jsx');
  const fnBody = contents.slice(
    contents.indexOf('async function handleGoogleAuth'),
    contents.indexOf('async function handleEmailSubmit'),
  );
  assert.match(fnBody, /setFeedback\(result\?\.message \?\? ''\);/);
  assert.doesNotMatch(fnBody, /result\?\.message \|\| /);
});

test('handleGoogleAuth trata excecao com feedback seguro', async () => {
  const contents = await source('./pages/MobileAuthPage.jsx');
  const fnBody = contents.slice(
    contents.indexOf('async function handleGoogleAuth'),
    contents.indexOf('async function handleEmailSubmit'),
  );
  assert.match(fnBody, /catch \{\s*\n\s*setFeedback\(getGoogleAuthFeedback/);
});

test('SocialAuthButtons recebe googleLoading e renderiza somente Google', async () => {
  const contents = await source('./components/SocialAuthButtons.jsx');
  assert.match(
    contents,
    /function SocialAuthButtons\(\{\s*\n\s*onGoogleAuth, disabled = false, googleLoading = false, label = 'Entrar com Google',\s*\n\s*\}\)/,
  );
  const googleButtonBlock = contents.slice(contents.indexOf('<Button'), contents.indexOf('{label}'));
  assert.match(googleButtonBlock, /loading=\{googleLoading\}/);
  assert.doesNotMatch(contents, /Apple/);
});

test('botao do Google e type="button" -- nunca envia um form por engano', async () => {
  const contents = await source('./components/SocialAuthButtons.jsx');
  const googleButtonBlock = contents.slice(contents.indexOf('<Button'), contents.indexOf('{label}'));
  assert.match(googleButtonBlock, /type="button"/);
});

test('getGoogleAuthFeedback nunca expõe o erro técnico cru do Supabase -- mensagem neutra fixa', () => {
  assert.equal(getGoogleAuthFeedback(null), null);
  assert.equal(
    getGoogleAuthFeedback({ message: 'provider is not enabled', code: 'validation_failed' }),
    'O acesso com Google ainda não está disponível neste ambiente.',
  );
  assert.equal(
    getGoogleAuthFeedback(new Error('some raw supabase internal error')),
    'O acesso com Google ainda não está disponível neste ambiente.',
  );
});

test('sessao autenticada não retorna ao Welcome', async () => {
  const app = await readFile(new URL('../../app/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /'\/welcome'/);
  // GUARD FIX: personalPlanCompleted (localStorage) deixou de ser
  // autorização -- personalPlanUnlocked deriva de billing-get-subscription
  // de verdade (usePersonalPlanAccessGuard), nunca do cache local.
  assert.match(
    app,
    /personalPlanUnlocked[\s\S]{0,20}\? requestedReturnPath[\s\S]{0,20}: !presentationCompleted[\s\S]{0,20}\? PRESENTATION_ROUTE[\s\S]{0,20}: PERSONAL_PLAN_ROUTE/,
  );
  assert.doesNotMatch(app, /needsOnboarding \? '\/onboarding'/);
});

test('schemas públicos permanecem imutáveis', () => {
  assert.equal(Object.isFrozen(validateAuthForm({}, AUTH_MODES.SIGN_IN)), true);
});
