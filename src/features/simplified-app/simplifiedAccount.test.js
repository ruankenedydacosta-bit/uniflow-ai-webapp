// ETAPA 4: SimplifiedAccountPage.jsx é um componente React real (hooks,
// modal, navegação) -- mesmo padrão já usado no projeto para telas sem
// Testing Library/jsdom instalados: cobertura estrutural por leitura de
// fonte (readFileSync/regex), igual a simplifiedApp.test.js e
// UniChatPage.test.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ACCOUNT_SUBROUTES } from './simplifiedAccountRoutes.js';
import { resolveSimplifiedGreeting } from './simplifiedGreeting.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// Rotas internas -- fonte única, paths reais, sem duplicidade.
// ============================================================================

// BLOCO FINAL DO MVP (Sobre a UniFlow AI): "notificacoes" e "privacidade"
// foram removidos TOTALMENTE (nunca só escondidos do menu) -- Notificações
// já mora exclusivamente no sino da Home; Privacidade e dados fica para uma
// tarefa futura junto de LGPD/exportação/exclusão de conta.
test('ACCOUNT_SUBROUTES tem exatamente os 9 paths pedidos, sob /app/conta/ -- notificacoes/privacidade removidos', () => {
  const paths = Object.values(ACCOUNT_SUBROUTES).map((r) => r.path).sort();
  assert.deepEqual(paths, [
    '/app/conta/editar-perfil',
    '/app/conta/minhas-contas',
    '/app/conta/pagamentos',
    '/app/conta/pagamentos/historico',
    '/app/conta/plano',
    '/app/conta/seguranca',
    '/app/conta/sobre',
    '/app/conta/suporte',
    '/app/conta/voz',
  ]);
  for (const path of paths) {
    assert.ok(path.startsWith('/app/conta/'), `path fora do namespace: ${path}`);
  }
});

test('todo subroute tem título e descrição honesta (nunca vazio, nunca dado fictício)', () => {
  for (const subroute of Object.values(ACCOUNT_SUBROUTES)) {
    assert.ok(subroute.title.trim());
    assert.ok(subroute.description.trim());
  }
});

test('nenhum path duplicado entre os 9 subroutes', () => {
  const paths = Object.values(ACCOUNT_SUBROUTES).map((r) => r.path);
  assert.equal(paths.length, new Set(paths).size);
});

// ============================================================================
// routes.jsx -- Conta substitui o placeholder; rotas internas existem;
// itens antigos (Financeiro/Uni/Agenda/Mais/seletor PF-PJ) nunca aparecem
// na navegação simplificada.
// ============================================================================

test('routes.jsx: /app/conta usa SimplifiedAccountPage, não mais o placeholder genérico', async () => {
  const routes = await source('../../app/routes.jsx');
  assert.match(routes, /path: SIMPLIFIED_ROUTES\.ACCOUNT,\s*\n\s*label: 'Conta',\s*\n\s*title: 'Conta',\s*\n\s*simplified: true,\s*\n\s*element: <SimplifiedAccountPage \/>/);
});

test('routes.jsx: as rotas internas de Conta são geradas a partir de ACCOUNT_SUBROUTES (fonte única, sem paths hardcoded soltos)', async () => {
  const routes = await source('../../app/routes.jsx');
  // Todas as 9 subrotas hoje têm tela real (Editar perfil, Segurança, Plano,
  // Pagamentos, Histórico, Minhas contas, Voz, Suporte, Sobre) -- o loop de
  // placeholders genéricos continua existindo (infraestrutura para futuras
  // subrotas), mas não gera nenhuma rota hoje.
  assert.match(routes, /Object\.values\(ACCOUNT_SUBROUTES\)\s*\n\s*\.filter\(\(subroute\) => \(/);
  assert.match(routes, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.EDIT_PROFILE\]\.path/);
  assert.match(routes, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.SECURITY\]\.path/);
  assert.match(routes, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.PLAN\]\.path/);
  assert.match(routes, /<SimplifiedAccountSubpagePlaceholder/);
  assert.match(routes, /<SimplifiedEditProfilePage \/>/);
  assert.match(routes, /<SimplifiedSecurityPage \/>/);
  assert.match(routes, /<SimplifiedPlanPage \/>/);
  assert.match(routes, /<SimplifiedVoicePage \/>/);
  assert.match(routes, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.VOICE\]\.path/);
  assert.match(routes, /<SimplifiedAboutPage \/>/);
  assert.match(routes, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.ABOUT\]\.path/);
  assert.match(routes, /simplified: true,/);
});

test('routes.jsx: importa SimplifiedAccountPage e SimplifiedAccountSubpagePlaceholder do barrel simplified-app', async () => {
  const routes = await source('../../app/routes.jsx');
  assert.match(routes, /SimplifiedAccountPage/);
  assert.match(routes, /SimplifiedAccountSubpagePlaceholder/);
  assert.match(routes, /ACCOUNT_SUBROUTES/);
});

// ============================================================================
// SimplifiedAppShell -- Conta e suas rotas internas usam cabeçalho próprio,
// nunca o genérico (marca + sino) duplicado por cima.
// ============================================================================

test('SimplifiedAppShell não duplica o cabeçalho genérico em /app/conta nem em /app/conta/*', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  assert.match(shell, /location\.pathname === SIMPLIFIED_ROUTES\.ACCOUNT/);
  assert.match(shell, /location\.pathname\.startsWith\(`\$\{SIMPLIFIED_ROUTES\.ACCOUNT\}\/`\)/);
});

// ============================================================================
// Página principal -- header, perfil, dados honestos, plano, menu, logout.
// ============================================================================

test('cabeçalho: título "Conta" e botão "Falar com a Uni" usam a rota pessoal, sem controlador novo', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.match(page, /<h1>Conta<\/h1>/);
  assert.match(page, /Falar com a Uni/);
  assert.match(page, /navigate\(SIMPLIFIED_ROUTES\.UNI\)/);
  assert.doesNotMatch(page, /new UniVoice|createVoiceController|useUniVoiceTts\(/);
});

test('perfil: usa Avatar com fallback de iniciais, nunca uma foto/pessoa fixa', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.match(page, /<Avatar\s*\n\s*src=\{profile\?\.avatar_url \|\| undefined\}\s*\n\s*name=\{profile\?\.full_name \|\| undefined\}/);
  assert.doesNotMatch(page, /Sr\. Ricardo|Sra\. |avatar fixo|foto fixa/i);
});

test('perfil: nome vem de resolveSimplifiedGreeting (mesma prioridade oficial: preferido > completo > primeiro nome > fallback neutro, nunca "Sr."/"Sra." inventado)', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.match(page, /resolveSimplifiedGreeting\(profile, user\)/);
  assert.match(page, /greeting\.hasKnownName/);
});

test('perfil: telefone real ou botão honesto "Adicionar telefone" -- nunca um número inventado', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.match(page, /profile\?\.phone/);
  assert.match(page, /Adicionar telefone/);
  assert.doesNotMatch(page, /\(11\) 9\d{4}-\d{4}/);
});

test('perfil: selo "Plano Pessoal" via Badge do design system', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.match(page, /<Badge variant="success" size="sm">Plano Pessoal<\/Badge>/);
});

test('ações Editar perfil e Segurança navegam para as rotas internas preparadas', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.match(page, /goTo\(ACCOUNT_SUBROUTE_IDS\.EDIT_PROFILE\)/);
  assert.match(page, /goTo\(ACCOUNT_SUBROUTE_IDS\.SECURITY\)/);
});

// ---------- Card do plano: fonte única, nunca dado inventado ----------
//
// Correção (Bloco Saldo + Cobrança): esta tela não reimplementa mais seu
// próprio resolvePlanState -- reaproveita subscriptionPresentation.js (a
// MESMA fonte de "Seu plano"/"Pagamento e assinatura"), buscando sua
// própria assinatura via billingService.getSubscription() em vez de
// useSession().subscription (esse último é filtrado para controle de
// acesso e escondia assinaturas canceladas/suspensas/pendentes como "sem
// assinatura"). Cobertura detalhada de cada estado vive em
// subscriptionPresentation.test.js.

test('busca a própria assinatura via billingService.getSubscription() -- nunca mais reaproveita useSession().subscription (filtrado para controle de acesso) para exibição', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.match(page, /import \{ getSubscription \} from '\.\.\/\.\.\/services\/billingService\.js';/);
  assert.match(page, /getSubscription\(\{ workspaceId \}\)\.then/);
  assert.doesNotMatch(page, /const \{ user, profile, workspace, subscription, signOut \} = useSession\(\);/);
});

test('usa a fonte única de apresentação de assinatura (subscriptionPresentation.js), nunca reimplementa o mapeamento de status aqui', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.match(page, /import \{ formatDate, resolvePlanState, resolveRenewsAt \} from '\.\/subscriptionPresentation\.js';/);
  assert.doesNotMatch(page, /function resolvePlanState/);
  assert.doesNotMatch(page, /function formatDate/);
});

test('card do plano só mostra preço/renovação quando o estado é realmente "ok" (active/trialing) -- nunca nos demais estados', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.match(page, /\{planState\.tone === 'ok' \? \(\s*\n\s*<span className=\{styles\.planPrice\}>/);
  assert.match(page, /\{renewsAt \? \(/);
});

test('preço exibido vem da constante compartilhada de personal-plan, nunca um valor duplicado/hardcoded na tela de Conta', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.match(page, /import \{\s*\n\s*PERSONAL_PLAN_PRICE_LABEL,\s*\n\s*PERSONAL_PLAN_PRICE_PERIOD,\s*\n\s*\} from '\.\.\/personal-plan\/personalPlanConfig\.js';/);
  assert.doesNotMatch(page, /R\$\s*29,90/);
});

// ---------- Menu principal: 5 itens, subtítulos dinâmicos e honestos ----------
// BLOCO FINAL DO MVP (Sobre a UniFlow AI): "Notificações" (já tem lar
// oficial no sino da Home) e "Privacidade e dados" (fora de escopo até
// LGPD/exportação/exclusão de conta) foram removidas TOTALMENTE do menu --
// nunca deve haver dois lugares para a mesma funcionalidade (notificações),
// e nunca um placeholder vazio prometendo algo que não existe ainda
// (privacidade).

test('menu tem exatamente os 5 itens pedidos, na ordem pedida -- Notificações e Privacidade e dados removidas', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  const order = ['PAYMENTS', 'MY_ACCOUNTS', 'VOICE', 'SUPPORT', 'ABOUT'];
  const indices = order.map((id) => page.indexOf(`ACCOUNT_SUBROUTE_IDS.${id},`));
  assert.ok(indices.every((i) => i > -1), 'algum item do menu está ausente');
  for (let i = 1; i < indices.length; i += 1) {
    assert.ok(indices[i] > indices[i - 1], `ordem incorreta: ${order[i - 1]} deveria vir antes de ${order[i]}`);
  }
  assert.doesNotMatch(page, /ACCOUNT_SUBROUTE_IDS\.NOTIFICATIONS/);
  assert.doesNotMatch(page, /ACCOUNT_SUBROUTE_IDS\.PRIVACY/);
});

test('NOTIFICATIONS e PRIVACY não existem mais em ACCOUNT_SUBROUTE_IDS/ACCOUNT_SUBROUTES -- remoção total, não só do menu', async () => {
  const routesSource = await source('./simplifiedAccountRoutes.js');
  assert.doesNotMatch(routesSource, /NOTIFICATIONS:/);
  assert.doesNotMatch(routesSource, /PRIVACY:/);
});

test('"Minhas contas" usa a contagem real de useAccounts -- nunca um número fixo', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.match(page, /accountState\.activeAccounts\.length/);
  assert.match(page, /Nenhuma conta cadastrada/);
});

test('"Pagamento e assinatura" nunca mostra um cartão inventado (ex.: "Visa final 1234")', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.doesNotMatch(page, /Visa final|final 1234|Mastercard final/i);
});

test('"Sobre a UniFlow AI" mostra uma versão real declarada explicitamente (fonte única appIdentity.js), não um placeholder solto', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.match(page, /import \{ APP_VERSION \} from '\.\/appIdentity\.js';/);
  assert.match(page, /Versão \$\{APP_VERSION\}/);
});

// ---------- Sair da conta ----------

test('logout: não sai direto -- abre modal de confirmação (nunca window.confirm)', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.match(page, /onClick=\{\(\) => setShowLogoutConfirm\(true\)\}/);
  assert.doesNotMatch(page, /window\.confirm/);
});

test('logout: modal usa o componente Modal compartilhado (Esc/X/foco já garantidos por ele)', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.match(page, /<Modal\s*\n\s*open=\{showLogoutConfirm\}/);
  assert.match(page, /title="Deseja sair da sua conta\?"/);
  assert.match(page, /description="Você precisará entrar novamente para acessar a UniFlow\."/);
});

test('logout: "Continuar conectado" fecha o modal sem chamar signOut; "Sair da conta" chama signOut', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  const modalBlock = page.slice(page.indexOf('<Modal'), page.indexOf('</Modal>'));
  assert.match(modalBlock, /Continuar conectado/);
  assert.match(modalBlock, /onClick=\{handleConfirmLogout\}/);
  const continueButtonBlock = modalBlock.slice(modalBlock.indexOf('Continuar conectado') - 300, modalBlock.indexOf('Continuar conectado'));
  assert.doesNotMatch(continueButtonBlock, /handleConfirmLogout/);
});

test('logout: loading real durante signOut (botão "Sair da conta" com loading), erro exibido se falhar, sessão nunca apagada em caso de erro', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  const fnBody = page.slice(page.indexOf('async function handleConfirmLogout'), page.indexOf('const menuItems'));
  assert.match(fnBody, /setIsSigningOut\(true\)/);
  assert.match(fnBody, /const result = await signOut\(\);/);
  assert.match(fnBody, /setIsSigningOut\(false\);/);
  assert.match(fnBody, /if \(result\?\.error\) \{/);
  assert.match(fnBody, /setLogoutError\(/);
  assert.match(page, /loading=\{isSigningOut\}/);
});

// ============================================================================
// Placeholder de subpáginas (Fase 8) -- título, botão voltar, mensagem
// curta, mesmo tema; nunca uma tela em branco.
// ============================================================================

test('SimplifiedAccountSubpagePlaceholder tem título, botão voltar (para /app/conta) e mensagem -- nunca em branco', async () => {
  const placeholder = await source('./SimplifiedAccountSubpagePlaceholder.jsx');
  assert.match(placeholder, /<h1>\{title\}<\/h1>/);
  assert.match(placeholder, /navigate\(SIMPLIFIED_ROUTES\.ACCOUNT\)/);
  assert.match(placeholder, /aria-label="Voltar para Conta"/);
  assert.match(placeholder, /<p>\{description\}<\/p>/);
});

test('Voz da Uni oferece providers e estilos de conversa e salva pelo SessionContext', async () => {
  const page = await source('./SimplifiedVoicePage.jsx');
  assert.match(page, /const \{ profile, updateVoicePreferences \} = useSession\(\);/);
  assert.match(page, /VOICE_PROVIDER_OPTIONS/);
  assert.match(page, /resolveVoiceProvider\(profile\?\.voice_provider\)/);
  assert.match(page, /Estilo de voz/);
  assert.match(page, /name="voice-provider"/);
  assert.match(page, /resolveConversationStyle\(profile\?\.conversation_style\)/);
  assert.match(page, /id: 'simple'/);
  assert.match(page, /id: 'normal'/);
  assert.match(page, /id: 'detailed'/);
  assert.match(page, /await updateVoicePreferences\(\{/);
  assert.match(page, /conversationStyle: selectedStyle/);
  assert.match(page, /voiceProvider: selectedVoiceProvider/);
  assert.ok(
    page.indexOf('<legend>Estilo de voz</legend>')
      < page.indexOf('<legend>Estilo de conversa</legend>'),
  );
  assert.doesNotMatch(page, /supabase|fetch\s*\(|localStorage/);
});

test('Voz da Uni salva somente quando há alteração e mantém o estado anterior em falha', async () => {
  const page = await source('./SimplifiedVoicePage.jsx');
  assert.match(page, /const hasChanges = selectedStyle !== activeStyle/);
  assert.match(page, /selectedVoiceProvider !== activeVoiceProvider/);
  assert.match(page, /if \(!hasChanges \|\| isSaving\) return;/);
  assert.match(page, /Sua preferência anterior foi mantida\./);
  assert.match(page, /disabled=\{!hasChanges \|\| isSaving\}/);
});

test('Voz da Uni possui estados honestos de loading, sucesso e erro', async () => {
  const page = await source('./SimplifiedVoicePage.jsx');
  assert.match(page, /Salvando…/);
  assert.match(page, /type: 'success'/);
  assert.match(page, /type: 'error'/);
  assert.match(page, /role=\{feedback\.type === 'error' \? 'alert' : 'status'\}/);
});

test('CSS da tela Voz da Uni cobre safe area, 320px, foco e redução de movimento', async () => {
  const css = await source('./simplifiedVoice.module.css');
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /@media \(max-width: 359px\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

// ============================================================================
// Responsividade estrutural (Fase 12) e acessibilidade (Fase 13) -- CSS.
// ============================================================================

test('CSS de Conta cobre safe-area, larguras estreitas (359/520px), desktop (1024px) e prefers-reduced-motion', async () => {
  const css = await source('./simplifiedAccount.module.css');
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /@media \(max-width: 359px\)/);
  assert.match(css, /@media \(min-width: 1024px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('cabeçalho de Conta usa flex-wrap (mesma correção de Registros) -- nunca sobrepõe título e botão em telas estreitas', async () => {
  const css = await source('./simplifiedAccount.module.css');
  const headerBlock = css.slice(css.indexOf('.header {'), css.indexOf('.titleGroup {'));
  assert.match(headerBlock, /flex-wrap: wrap;/);
});

test('todas as áreas de toque interativas (perfil, plano, menu, logout, voltar) têm foco visível (:focus-visible)', async () => {
  const css = await source('./simplifiedAccount.module.css');
  assert.match(css, /\.menuRow:focus-visible/);
  assert.match(css, /\.planCard:focus-visible/);
  assert.match(css, /\.logoutCard:focus-visible/);
  assert.match(css, /\.backButton:focus-visible/);
});

// ============================================================================
// Regressão: resolveSimplifiedGreeting continua puro e honesto (reaproveitado
// aqui, não reescrito).
// ============================================================================

test('resolveSimplifiedGreeting nunca infere tratamento e só usa a preferência explícita do perfil', () => {
  const withoutSalutation = resolveSimplifiedGreeting({ full_name: 'Ricardo Souza' }, null);
  assert.equal(withoutSalutation.salutation, '');
  assert.equal(withoutSalutation.heading, 'Ricardo');

  const withSalutation = resolveSimplifiedGreeting({
    full_name: 'Ricardo Souza',
    treatment_preference: 'senhor',
  }, null);
  assert.equal(withSalutation.salutation, 'senhor');
  assert.equal(withSalutation.heading, 'senhor Ricardo');
});

test('resolveSimplifiedGreeting sem nenhum nome disponível cai no fallback neutro "você" (nunca inventa)', () => {
  const noName = resolveSimplifiedGreeting({}, null);
  assert.equal(noName.hasKnownName, false);
  assert.equal(noName.name, 'você');
});
