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

// BLOCO FINAL DO MVP (Sobre a UniFlow AI): "privacidade" foi removida
// TOTALMENTE (nunca só escondida do menu) -- fica para uma tarefa futura
// junto de LGPD/exportação/exclusão de conta.
// Fase 3 do redesign (#90): "notificacoes" voltou como página própria
// (tela 13 do handoff), alcançada pelo item Notificações do Mais.
// Épico #98 (#99): "google-agenda" entra fora do menu.
test('ACCOUNT_SUBROUTES tem exatamente os 12 paths pedidos, sob /app/conta/ -- privacidade removida, notificacoes da Fase 3, google-agenda do #99', () => {
  const paths = Object.values(ACCOUNT_SUBROUTES).map((r) => r.path).sort();
  assert.deepEqual(paths, [
    '/app/conta/editar-perfil',
    '/app/conta/google-agenda',
    '/app/conta/minhas-contas',
    '/app/conta/notificacoes',
    '/app/conta/pagamentos',
    '/app/conta/pagamentos/historico',
    '/app/conta/plano',
    '/app/conta/seguranca',
    '/app/conta/sobre',
    '/app/conta/suporte',
    '/app/conta/tema',
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

test('nenhum path duplicado entre os 12 subroutes', () => {
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
  // Todas as 10 subrotas hoje têm tela real (Editar perfil, Segurança, Plano,
  // Pagamentos, Histórico, Minhas contas, Voz, Suporte, Tema, Sobre) -- o loop de
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
  assert.match(routes, /<SimplifiedThemePage \/>/);
  assert.match(routes, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.THEME\]\.path/);
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

// Fase 3 do redesign (#90): o título passa a ser "Mais" (tela 07) e o
// acesso à Uni é o orb da navegação inferior, não um botão no cabeçalho.
test('cabeçalho: título "Mais" com o símbolo de 26px, sem botão "Falar com a Uni" nem controlador novo', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.match(page, /<h1>Mais<\/h1>/);
  assert.match(page, /<UniMark \/>/);
  assert.doesNotMatch(page, /Falar com a Uni/);
  assert.doesNotMatch(page, /new UniVoice|createVoiceController|useUniVoiceTts\(/);
});

test('perfil: usa Avatar com fallback de iniciais, nunca uma foto/pessoa fixa', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.match(page, /<Avatar\s*\n\s*className=\{styles\.avatar\}\s*\n\s*src=\{profile\?\.avatar_url \|\| undefined\}\s*\n\s*name=\{profile\?\.full_name \|\| undefined\}/);
  assert.doesNotMatch(page, /Sr\. Ricardo|Sra\. |avatar fixo|foto fixa/i);
});

test('perfil: nome vem de resolveSimplifiedGreeting (mesma prioridade oficial: preferido > completo > primeiro nome > fallback neutro, nunca "Sr."/"Sra." inventado)', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.match(page, /resolveSimplifiedGreeting\(profile, user\)/);
  assert.match(page, /greeting\.hasKnownName/);
});

// Fase 3 do redesign (#90): o card de perfil mostra nome e e-mail e abre
// Perfil (tela 07); telefone e selo do plano saíram do card -- o telefone
// é editado em Perfil e o plano tem o próprio card logo abaixo.
test('perfil: card com nome e e-mail reais abre Perfil -- nunca um telefone ou número inventado', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.match(page, /const email = user\?\.email \?\? '';/);
  assert.match(page, /className=\{styles\.profileCard\}\s*\n\s*onClick=\{\(\) => goTo\(ACCOUNT_SUBROUTE_IDS\.EDIT_PROFILE\)\}/);
  assert.doesNotMatch(page, /\(11\) 9\d{4}-\d{4}/);
  assert.doesNotMatch(page, /<Badge/);
});

test('grupo Conta: Perfil, Configurações e Segurança navegam para as rotas internas preparadas', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  const block = page.slice(page.indexOf('const accountItems'), page.indexOf('const productItems'));
  assert.match(block, /id: ACCOUNT_SUBROUTE_IDS\.EDIT_PROFILE,\s*\n\s*Icon: PhUserIcon,\s*\n\s*title: 'Perfil',/);
  assert.match(block, /id: ACCOUNT_SUBROUTE_IDS\.THEME,\s*\n\s*Icon: PhGearIcon,\s*\n\s*title: 'Configurações',/);
  assert.match(block, /id: ACCOUNT_SUBROUTE_IDS\.SECURITY,\s*\n\s*Icon: PhShieldCheckIcon,\s*\n\s*title: 'Segurança',/);
  assert.match(page, /navigate\(ACCOUNT_SUBROUTES\[subrouteId\]\.path\)/);
});

test('nenhum item do Mais leva a tela que o app simplificado não tem (Visão de futuro, Categorias, Open Finance)', async () => {
  const page = (await source('./SimplifiedAccountPage.jsx'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(page, /Visão de futuro|'Categorias'|Open Finance|Espaço ativo/);
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

test('preço exibido é o da assinatura (épico #116), com a constante compartilhada de personal-plan como reserva -- nunca um valor hardcoded na tela de Conta', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.match(page, /import \{\s*\n\s*formatPlanPrice,\s*\n\s*PERSONAL_PLAN_PRICE_LABEL,\s*\n\s*PERSONAL_PLAN_PRICE_PERIOD,\s*\n\s*\} from '\.\.\/personal-plan\/personalPlanConfig\.js';/);
  assert.match(page, /\{formatPlanPrice\(subscription\?\.value\) \|\| PERSONAL_PLAN_PRICE_LABEL\}/);
  assert.doesNotMatch(page, /R\$\s*29,90/);
});

// ---------- Menu principal: itens funcionais, subtítulos dinâmicos e honestos ----------
// BLOCO FINAL DO MVP (Sobre a UniFlow AI): "Notificações" (já tem lar
// oficial no sino da Home) e "Privacidade e dados" (fora de escopo até
// LGPD/exportação/exclusão de conta) foram removidas TOTALMENTE do menu --
// nunca deve haver dois lugares para a mesma funcionalidade (notificações),
// e nunca um placeholder vazio prometendo algo que não existe ainda
// (privacidade).

// CONTA-OPCIONAL: "Minhas contas" saiu do menu de Conta -- a gestão de
// contas bancárias deixou de ser um destino de primeira classe agora que
// receita/despesa não dependem mais de conta. A subrota/tela em si continua
// existindo (ainda usada por transferência/ajuste de saldo), só não tem mais
// entrada aqui.
// Fase 3 do redesign (#90): ordem da tela 07 -- Conta (Perfil, Configurações,
// Segurança), Produto (Relatórios, Agenda, Notificações, Pagamento e
// assinatura, Voz da Uni, Suporte, Privacidade e Analytics, Sobre) e Sessão
// (Sair).
test('menu preserva os itens existentes na ordem da tela 07 e inclui a preferência mínima de Analytics antes de Sobre', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  const order = ['EDIT_PROFILE', 'THEME', 'SECURITY', 'PAYMENTS', 'VOICE', 'SUPPORT', 'ABOUT'];
  const indices = order.map((id) => page.indexOf(`ACCOUNT_SUBROUTE_IDS.${id},`));
  assert.ok(indices.every((i) => i > -1), 'algum item do menu está ausente');
  for (let i = 1; i < indices.length; i += 1) {
    assert.ok(indices[i] > indices[i - 1], `ordem incorreta: ${order[i - 1]} deveria vir antes de ${order[i]}`);
  }
  assert.match(page, /to: SIMPLIFIED_ROUTES\.RELATORIO,/);
  assert.doesNotMatch(page, /ACCOUNT_SUBROUTE_IDS\.PRIVACY/);
  assert.doesNotMatch(page, /ACCOUNT_SUBROUTE_IDS\.MY_ACCOUNTS/);
  const analyticsIndex = page.indexOf("id: 'analytics-consent'");
  assert.ok(analyticsIndex > indices[5] && analyticsIndex < indices[6]);
  assert.match(page, /title: 'Privacidade e Analytics'/);
});

// #128 tirou da Home o link "Ver conversa completa". A conversa escrita
// (/app/uni) passou a abrir pelo primeiro item do grupo Produto, sem passar
// pela tela de voz, que liga o microfone.
test('menu Mais abre a conversa escrita com a Uni no topo do grupo Produto', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  const productItems = page.slice(page.indexOf('const productItems'), page.indexOf('function renderRow'));
  assert.ok(productItems.indexOf("id: 'uni-chat'") > -1, 'item da conversa ausente');
  assert.ok(productItems.indexOf("id: 'uni-chat'") < productItems.indexOf("id: 'reports'"));
  assert.match(productItems, /title: 'Conversa com a Uni',/);
  assert.match(productItems, /to: SIMPLIFIED_ROUTES\.UNI,/);
  // Notificações continua depois de Relatórios e Agenda.
  assert.match(page, /\{productItems\.slice\(0, 3\)\.map\(renderRow\)\}\s*<SimplifiedAccountNotificationsRow \/>/);
});

test('PRIVACY não existe em ACCOUNT_SUBROUTE_IDS/ACCOUNT_SUBROUTES -- remoção total, não só do menu; NOTIFICATIONS existe (Fase 3)', async () => {
  const routesSource = await source('./simplifiedAccountRoutes.js');
  assert.match(routesSource, /NOTIFICATIONS: 'notifications',/);
  assert.doesNotMatch(routesSource, /PRIVACY:/);
});

// PUSH1 (ajuste de UX): a ativação de Web Push mora em Conta -- a única tela
// real alcançável pela navegação (a antiga /configuracoes nunca é
// renderizada de verdade, App.jsx redireciona qualquer rota não
// simplificada para /app/home). É uma SEÇÃO própria (não uma subrota nova,
// nem um item de menuItems que navega para outro lugar) -- fica visível
// direto nesta tela, entre o card do plano e o menu de configurações.
// NOTIF-UX3: o card grande "Notificações no celular" (com badge Ativadas/
// Desativadas, "Enviar notificação de teste" e "Desativar notificações"
// visíveis pra qualquer usuário) foi substituído por uma linha compacta,
// no MESMO padrão visual de Agenda/Pagamento/Voz/Suporte -- deixou de
// parecer painel de desenvolvimento. SimplifiedPushNotificationsCard.jsx
// continua existindo (nunca deletado, testes próprios continuam passando,
// Edge Function de teste intacta) só deixou de ser renderizado em Conta.
// Fase 3 do redesign (#90): a linha fica no grupo Produto, logo depois de
// Relatórios, como na tela 07.
test('linha compacta de notificações substitui o card grande -- mesmo padrão visual das demais linhas, no grupo Produto', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.doesNotMatch(page, /SimplifiedPushNotificationsCard/);
  assert.match(page, /import SimplifiedAccountNotificationsRow from '\.\/SimplifiedAccountNotificationsRow\.jsx';/);
  const productIndex = page.indexOf('aria-label="Produto"');
  const rowIndex = page.indexOf('<SimplifiedAccountNotificationsRow />');
  const sessionIndex = page.indexOf('aria-label="Sessão"');
  assert.ok(productIndex > -1 && rowIndex > productIndex && rowIndex < sessionIndex, 'a linha vive DENTRO do grupo Produto');
});

test('linha de notificações nunca mostra "Enviar notificação de teste" nem "Desativar notificações" para o usuário comum', async () => {
  const row = await source('./SimplifiedAccountNotificationsRow.jsx');
  assert.doesNotMatch(row, /Enviar notificação de teste/);
  assert.doesNotMatch(row, /Desativar notificações/);
  assert.doesNotMatch(row, /disableNotifications/);
  assert.doesNotMatch(row, /sendTest/);
});

// Fase 3 do redesign (#90): a linha abre a página de notificações (tela 13)
// e mostra quantas estão por ler; a ativação do push mora dentro da página,
// no mesmo aviso do painel do sino (useWebPush continua a fonte única).
test('linha de notificações lê o estado do sino publicado pelo shell (contexto) e abre a página de notificações', async () => {
  const row = await source('./SimplifiedAccountNotificationsRow.jsx');
  assert.match(row, /import \{ useSimplifiedNotifications \} from '\.\/simplifiedNotificationsContext\.js';/);
  assert.doesNotMatch(row, /useNotifications\(/);
  assert.match(row, /navigate\(ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.NOTIFICATIONS\]\.path\)/);
  assert.doesNotMatch(row, /useWebPush|enableNotifications/);
});

test('estados da linha: "N não lida(s)" quando há por ler, "Tudo em dia" quando não há', async () => {
  const row = await source('./SimplifiedAccountNotificationsRow.jsx');
  assert.match(row, /não lida\$\{unreadCount > 1 \? 's' : ''\}/);
  assert.match(row, /'Tudo em dia'/);
});

// Épico #98 (#99): a 12ª rota é a do Google Agenda, que não é de push.
test('nenhuma rota nova foi criada para Web Push -- as rotas novas são notificações (Fase 3) e Google Agenda (#99)', async () => {
  const paths = Object.values(ACCOUNT_SUBROUTES).map((r) => r.path);
  assert.equal(paths.length, 12);
  assert.ok(!paths.some((path) => /push/i.test(path)), 'nenhum path novo relacionado a push');
});

test('Google Agenda fica fora do menu do Mais até a #102', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.doesNotMatch(page, /GOOGLE_CALENDAR|google-agenda/);
});

test('useAccounts não é mais importado nesta tela -- "Minhas contas" não faz mais parte do menu de Conta', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.doesNotMatch(page, /useAccounts/);
  assert.doesNotMatch(page, /accountState/);
});

test('"Pagamento e assinatura" nunca mostra um cartão inventado (ex.: "Visa final 1234")', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.doesNotMatch(page, /Visa final|final 1234|Mastercard final/i);
});

test('"Sobre a UniFlow AI" mostra a versão atual real (currentVersion de useUniUpdates, mesma fonte da Central de Novidades e da notificação), não um placeholder solto nem um APP_VERSION fixo isolado', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.match(page, /import \{ useUniUpdates \} from '\.\/useUniUpdates\.js';/);
  assert.match(page, /const \{ currentVersion \} = useUniUpdates\(\{ limit: 1 \}\);/);
  assert.match(page, /Versão \$\{currentVersion\}/);
  assert.doesNotMatch(page, /APP_VERSION/);
});

// Fase 3 do redesign (#90): a linha chama-se "Configurações" (tela 07) e
// abre a aba Preferências, onde o tema é escolhido; sem apoio na linha.
test('linha "Configurações" (rota de Tema) nunca menciona Escuro/Sistema, removidos do seletor', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  const themeStart = page.indexOf('ACCOUNT_SUBROUTE_IDS.THEME,');
  const themeSlice = page.slice(themeStart, page.indexOf('},', themeStart));
  assert.match(themeSlice, /title: 'Configurações',/);
  assert.doesNotMatch(themeSlice, /Escuro|Sistema/);
});

// ---------- Sair da conta ----------

test('logout: não sai direto -- abre modal de confirmação (nunca window.confirm)', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  assert.match(page, /onClick=\{\(\) => setShowLogoutConfirm\(true\)\}/);
  assert.doesNotMatch(page, /window\.confirm/);
});

test('logout: modal usa o aviso curto da tela 22g, montado sobre o Modal compartilhado (Esc/foco já garantidos por ele)', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  const confirmModal = await source('./SimplifiedConfirmModal.jsx');
  assert.match(page, /<SimplifiedConfirmModal\s*\n\s*open=\{showLogoutConfirm\}/);
  assert.match(confirmModal, /<Modal\b/);
  assert.match(page, /title="Deseja sair da sua conta\?"/);
  assert.match(page, /description="Você precisará entrar novamente para acessar a UniFlow\."/);
});

test('logout: "Continuar conectado" fecha o modal sem chamar signOut; "Sair da conta" chama signOut', async () => {
  const page = await source('./SimplifiedAccountPage.jsx');
  const start = page.indexOf('<SimplifiedConfirmModal');
  const modalBlock = page.slice(start, page.indexOf('\n      />', start));
  assert.match(modalBlock, /cancelLabel="Continuar conectado"/);
  assert.match(modalBlock, /onConfirm=\{handleConfirmLogout\}/);
  // Sem onCancel, "Continuar conectado" só chama o onClose, que fecha sem sair.
  assert.doesNotMatch(modalBlock, /onCancel=/);
  const onCloseLine = modalBlock.slice(modalBlock.indexOf('onClose='), modalBlock.indexOf('\n', modalBlock.indexOf('onClose=')));
  assert.doesNotMatch(onCloseLine, /handleConfirmLogout|signOut/);
});

test('aviso curto: sem X por padrão, e toque fora, Esc e as duas ações travam enquanto a ação roda', async () => {
  const confirmModal = await source('./SimplifiedConfirmModal.jsx');
  assert.match(confirmModal, /hideCloseButton=\{!closeButton\}/);
  assert.match(confirmModal, /closeButton = false,/);
  assert.match(confirmModal, /closeOnOverlayClick=\{!busy\}/);
  assert.match(confirmModal, /closeOnEsc=\{!busy\}/);
  assert.match(confirmModal, /busy = loading,/);
  const buttons = confirmModal.match(/<OutlineButton[^>]*>/g) ?? [];
  assert.equal(buttons.length, 2);
  for (const button of buttons) assert.match(button, /disabled=\{busy\}/);
  assert.match(buttons[0], /onClick=\{onConfirm\}/);
  assert.match(buttons[0], /loading=\{loading\}/);
  assert.match(buttons[1], /onClick=\{onCancel \?\? onClose\}/);
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

test('Voz da Uni oferece só os estilos de conversa e salva só o estilo', async () => {
  const page = await source('./SimplifiedVoicePage.jsx');
  assert.match(page, /const \{ profile, updateConversationStyle \} = useSession\(\);/);
  assert.doesNotMatch(page, /VOICE_PROVIDER_OPTIONS|Estilo de voz|name="voice-provider"|voiceProvider|uni-voice-tts/);
  assert.match(page, /resolveConversationStyle\(profile\?\.conversation_style\)/);
  assert.match(page, /id: 'simple'/);
  assert.match(page, /id: 'normal'/);
  assert.match(page, /id: 'detailed'/);
  assert.match(page, /await updateConversationStyle\(selectedStyle\);/);
  assert.match(page, /<legend>Estilo de conversa<\/legend>/);
  assert.doesNotMatch(page, /supabase|fetch\s*\(|localStorage/);
});

test('Voz da Uni salva somente quando há alteração e mantém o estado anterior em falha', async () => {
  const page = await source('./SimplifiedVoicePage.jsx');
  assert.match(page, /const hasChanges = selectedStyle !== activeStyle;/);
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

// Fase 3 (#90): a tela não tem transição nem regra própria para 520px, então
// esses blocos saíram (eram CSS sem efeito); ficam safe-area, 359px e 1024px.
test('CSS de Conta cobre safe-area, largura estreita (359px) e desktop (1024px)', async () => {
  const css = await source('./simplifiedAccount.module.css');
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /@media \(max-width: 359px\)/);
  assert.match(css, /@media \(min-width: 1024px\)/);
  assert.doesNotMatch(css, /transition: none/);
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
