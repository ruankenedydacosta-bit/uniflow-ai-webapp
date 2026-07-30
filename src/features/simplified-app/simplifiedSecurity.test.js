// ETAPA 4: SimplifiedSecurityPage.jsx é um componente React real (hooks,
// modal, Supabase Auth real) -- mesmo padrão já usado no projeto para telas
// sem Testing Library/jsdom instalados: cobertura estrutural por leitura de
// fonte (readFileSync/regex), igual a simplifiedEditProfile.test.js e
// simplifiedAccount.test.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// routes.jsx -- seguranca usa a tela real, demais subrotas continuam
// placeholders.
// ============================================================================

test('routes.jsx renderiza SimplifiedSecurityPage na rota de segurança', async () => {
  const content = await source('../../app/routes.jsx');
  assert.match(content, /SimplifiedSecurityPage/);
  assert.match(
    content,
    /ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.SECURITY\]\.path[\s\S]{0,200}<SimplifiedSecurityPage \/>/,
  );
});

test('routes.jsx filtra editar-perfil E segurança da lista de placeholders genéricos', async () => {
  const content = await source('../../app/routes.jsx');
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.EDIT_PROFILE\]\.path/);
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.SECURITY\]\.path/);
});

test('index.js exporta SimplifiedSecurityPage', async () => {
  const content = await source('./index.js');
  assert.match(content, /export \{ default as SimplifiedSecurityPage \} from '\.\/SimplifiedSecurityPage\.jsx';/);
});

// ============================================================================
// Cabeçalho.
// ============================================================================

test('cabeçalho tem botão voltar, título, subtítulo curto e Falar com a Uni real', async () => {
  const content = await source('./SimplifiedSecurityPage.jsx');
  assert.match(content, /aria-label="Voltar para Conta"/);
  assert.match(content, /navigate\(SIMPLIFIED_ROUTES\.ACCOUNT\)/);
  assert.match(content, /<h1>Segurança<\/h1>/);
  assert.match(content, /Gerencie a segurança da sua conta\./);
  assert.match(content, /navigate\(SIMPLIFIED_ROUTES\.UNI\)/);
});

// ============================================================================
// Visão geral -- sem porcentagem, sem "Nível: Alto" inventado.
// ============================================================================

test('visão geral não calcula porcentagem nem nível fixo inventado', async () => {
  const content = await source('./SimplifiedSecurityPage.jsx');
  assert.doesNotMatch(content, /100%|Nível de proteção|Alto\b/);
});

test('resumo honesto muda conforme sinais reais (email verificado + identidade)', async () => {
  const content = await source('./SimplifiedSecurityPage.jsx');
  assert.match(content, /const hasBasicProtection = isEmailVerified && \(hasPasswordIdentity \|\| Boolean\(oauthProvider\)\)/);
  assert.match(content, /Sua conta possui as proteções básicas ativas\./);
  assert.match(content, /Há configurações de segurança que ainda podem ser concluídas\./);
});

test('checklist só mostra os 3 sinais reais (nunca telefone verificado nem último acesso reconhecido no card)', async () => {
  const content = await source('./SimplifiedSecurityPage.jsx');
  assert.match(content, /E-mail verificado/);
  assert.match(content, /Senha configurada/);
  assert.match(content, /Verificação em duas etapas não configurada/);
  assert.doesNotMatch(content, /Telefone verificado/);
  assert.doesNotMatch(content, /Último acesso reconhecido/);
});

test('e-mail verificado e senha configurada vêm de campos reais do Supabase Auth', async () => {
  const content = await source('./SimplifiedSecurityPage.jsx');
  assert.match(content, /const isEmailVerified = Boolean\(user\?\.email_confirmed_at\)/);
  assert.match(content, /identity\?\.provider === 'email'/);
});

// ============================================================================
// Alterar senha -- reaproveita requestPasswordReset real, nunca senha falsa.
// ============================================================================

test('alterar senha reaproveita requestPasswordReset do useSession() (mesmo fluxo do login/Configurações)', async () => {
  const content = await source('./SimplifiedSecurityPage.jsx');
  assert.match(content, /await requestPasswordReset\(user\.email\)/);
  assert.match(content, /getPasswordResetRequestFeedback/);
});

test('usuário só-OAuth vê orientação honesta em vez de botão de trocar senha', async () => {
  const content = await source('./SimplifiedSecurityPage.jsx');
  assert.match(content, /Você entra com sua conta \$\{oauthProvider\}\. A senha é gerenciada por lá\./);
  assert.match(content, /\{hasPasswordIdentity \? \(/);
});

// ============================================================================
// MFA -- honesto, sem simular ativação.
// ============================================================================

test('verificação em duas etapas mostra estado honesto "Não configurada", nunca ativada', async () => {
  const content = await source('./SimplifiedSecurityPage.jsx');
  assert.match(content, /variant="warning" size="sm">Não configurada/);
  assert.match(content, /Estará disponível em uma futura versão\./);
  assert.doesNotMatch(content, /mfa\.enroll|supabase\.auth\.mfa/);
});

// ============================================================================
// Aparelhos e atividade -- honestamente vazios, nunca inventados.
// ============================================================================

test('seus aparelhos não inventa iPhone/MacBook/Windows nem localização', async () => {
  const content = await source('./SimplifiedSecurityPage.jsx');
  assert.match(content, /Informações de aparelhos ainda não estão disponíveis nesta versão\./);
  assert.doesNotMatch(content, /iPhone|MacBook|Windows|São Paulo|Fortaleza|Curitiba/);
});

test('atividade recente só usa last_sign_in_at real (Supabase Auth), nunca tentativa de login fictícia', async () => {
  const content = await source('./SimplifiedSecurityPage.jsx');
  assert.match(content, /user\?\.last_sign_in_at/);
  assert.match(content, /Não há mais detalhes de atividade disponíveis nesta versão\./);
  assert.doesNotMatch(content, /Tentativa de login|Não fui eu/);
});

// ============================================================================
// Recuperação da conta.
// ============================================================================

test('e-mail de recuperação vem de user.email; badge Verificado só com email_confirmed_at real', async () => {
  const content = await source('./SimplifiedSecurityPage.jsx');
  assert.match(content, /<strong>\{user\?\.email \|\| 'Ainda não definido'\}<\/strong>/);
  assert.match(content, /\{isEmailVerified \? <Badge variant="success" size="sm">Verificado<\/Badge> : null\}/);
});

test('telefone de recuperação nunca mostra Verificado (sem verificação real desse dado)', async () => {
  const content = await source('./SimplifiedSecurityPage.jsx');
  const phoneBlock = content.match(/Telefone de recuperação[\s\S]{0,200}/)[0];
  assert.doesNotMatch(phoneBlock, /Verificado/);
});

test('link de atualizar contatos vai para Editar perfil real, não finge um fluxo próprio', async () => {
  const content = await source('./SimplifiedSecurityPage.jsx');
  assert.match(content, /navigate\(ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.EDIT_PROFILE\]\.path\)/);
});

// ============================================================================
// Encerrar sessões -- ação crítica real, honesta, com confirmação acessível.
// ============================================================================

test('encerrar sessões reaproveita o signOut() real do useSession() (mesmo da Conta)', async () => {
  const content = await source('./SimplifiedSecurityPage.jsx');
  assert.match(content, /const result = await signOut\(\);/);
});

test('modal de confirmação explica o efeito real (inclui esta sessão) e não usa window.confirm', async () => {
  const content = await source('./SimplifiedSecurityPage.jsx');
  assert.match(content, /Você e qualquer outro aparelho conectado serão desconectados/);
  assert.doesNotMatch(content, /window\.confirm/);
});

test('ação crítica tem loading e tratamento de erro, nunca apaga dados do usuário', async () => {
  const content = await source('./SimplifiedSecurityPage.jsx');
  assert.match(content, /loading=\{isEndingSessions\}/);
  assert.match(content, /Não foi possível encerrar as sessões agora\. Tente novamente\./);
  assert.doesNotMatch(content, /deleteUser|\.delete\(\)/);
});

// ============================================================================
// Acessibilidade e responsividade.
// ============================================================================

test('CSS oferece foco visível, prefers-reduced-motion e responsividade', async () => {
  const css = await source('./simplifiedSecurity.module.css');
  assert.match(css, /\.backButton:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /@media \(min-width: 1024px\)/);
});

test('zona crítica é visualmente distinta (cor de aviso), não depende só de cor (também tem ícone e texto)', async () => {
  const content = await source('./SimplifiedSecurityPage.jsx');
  assert.match(content, /<AlertTriangleIcon \/>/);
  const css = await source('./simplifiedSecurity.module.css');
  assert.match(css, /\.criticalCard \{[^}]*border-color:\s*rgba\(239, 68, 68/);
});
