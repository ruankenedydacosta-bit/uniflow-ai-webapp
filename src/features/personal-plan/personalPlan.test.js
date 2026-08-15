import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PERSONAL_PLAN_BENEFITS,
  PERSONAL_PLAN_ID,
  PERSONAL_PLAN_ROUTE,
  PERSONAL_PLAN_TRUST_SEALS,
} from './personalPlanConfig.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// BLOCO FINAL DO MVP: PersonalPlanPage.jsx passou a chamar o backend Asaas
// real (billingService) -- createCustomer -> createSubscription -> polling
// até `active`. Cobertura estrutural (mesmo padrão do resto do projeto,
// sem @testing-library/react instalado).
// ============================================================================

test('plano pessoal possui rota e identidade estáveis', () => {
  assert.equal(PERSONAL_PLAN_ROUTE, '/plano-pessoal');
  assert.equal(PERSONAL_PLAN_ID, 'personal');
});

test('benefícios possuem exatamente os seis itens aprovados', () => {
  assert.equal(PERSONAL_PLAN_BENEFITS.length, 6);
  assert.deepEqual(
    PERSONAL_PLAN_BENEFITS.map(({ title }) => title),
    [
      'Registrar por voz',
      'Categorias inteligentes',
      'Pergunte à Uni',
      'Histórico completo',
      'Resumo mensal',
      'Controle de contas',
    ],
  );
  assert.equal(Object.isFrozen(PERSONAL_PLAN_BENEFITS), true);
  assert.equal(Object.isFrozen(PERSONAL_PLAN_BENEFITS[0]), true);
});

test('rodapé possui exatamente os quatro selos aprovados', () => {
  assert.deepEqual(
    PERSONAL_PLAN_TRUST_SEALS.map(({ label }) => label),
    [
      'Dados protegidos',
      'Tecnologia segura',
      'Suporte humano',
      'Feito para facilitar sua vida',
    ],
  );
});

test('startSubscription.js foi removido -- CTA agora chama billingService de verdade', async () => {
  await assert.rejects(source('./startSubscription.js'), /ENOENT/);
  const indexSource = await source('./index.js');
  assert.doesNotMatch(indexSource, /startSubscription/);
});

test('BILLING_PLAN_ID é "pro" (internal id real do backend) -- distinto de PERSONAL_PLAN_ID ("personal", só identidade da rota)', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /const BILLING_PLAN_ID = 'pro';/);
  assert.match(page, /planId: BILLING_PLAN_ID,/);
});

test('CTA abre o modal de método (nunca chama o backend direto no clique do botão principal)', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /onClick=\{handleBeginCheckout\}/);
  assert.match(page, /function handleBeginCheckout\(\) \{[\s\S]*?setFlowState\('method_modal'\);[\s\S]*?\}/);
  assert.match(page, /ASSINAR PLANO PESSOAL/);
});

// BLOCO ASAAS CHECKOUT: cartão deixou de ser desabilitado -- agora usa o
// Asaas Checkout hospedado. Pix continua funcionando exatamente como antes
// (nenhuma regressão no fluxo direto).
test('modal de método: Pix e cartão de crédito são ambos selecionáveis -- nenhum aparece desabilitado', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /const \[paymentMethod, setPaymentMethod\] = useState\('pix'\);/);
  assert.match(page, /checked={paymentMethod === 'pix'}/);
  assert.match(page, /checked={paymentMethod === 'credit_card'}/);
  assert.doesNotMatch(page, /value="credit_card" disabled/);
});

test('modal de método: texto do cartão é "pagamento seguro no Asaas" -- honesto sobre onde o pagamento acontece', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /Cartão de crédito <small>— pagamento seguro no Asaas<\/small>/);
});

// GUARD FIX: PersonalPlanPage.jsx agora cria o workspace pessoal sob
// demanda (createWorkspaceProfile('personal')) quando o usuário ainda não
// tem um -- resolvedWorkspaceId é workspaceId já existente OU o recém-criado.
// Cartão continua nunca passando por createCustomer/createSubscription.
test('confirmar com cartão chama createCheckout (nunca createCustomer/createSubscription) e redireciona na MESMA aba para checkout_url', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const idx = page.indexOf("if (paymentMethod === 'credit_card') {");
  const endIdx = page.indexOf('let customerResult;', idx);
  const body = page.slice(idx, endIdx);
  assert.match(body, /await createCheckout\(\{ workspaceId: resolvedWorkspaceId \}\)/);
  assert.match(body, /window\.location\.href = checkoutResult\.data\.checkout_url;/);
  assert.doesNotMatch(body, /createCustomer\(|createSubscription\(/);
});

test('cartão/Pix criam o workspace pessoal sob demanda quando ainda não existe -- nunca bloqueiam a assinatura por falta de workspace', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const idx = page.indexOf('let resolvedWorkspaceId = workspaceId;');
  assert.ok(idx > -1, 'deveria existir a resolução de workspaceId antes de qualquer chamada de billing');
  const slice = page.slice(idx, idx + 550);
  assert.match(slice, /if \(!resolvedWorkspaceId\) \{/);
  assert.match(slice, /await createWorkspaceProfile\('personal'\)/);
  assert.match(slice, /resolvedWorkspaceId = workspaceResult\.data\.id;/);
});

test('falha ao criar o workspace pessoal sob demanda preserva o modal com mensagem honesta -- nunca prossegue sem workspace', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const idx = page.indexOf('if (!resolvedWorkspaceId) {');
  const slice = page.slice(idx, idx + 350);
  assert.match(slice, /if \(workspaceResult\.error \|\| !workspaceResult\.data\?\.id\) \{/);
  assert.match(slice, /setIsSubmitting\(false\);/);
  assert.match(slice, /return;/);
});

test('cartão nunca considera o plano ativo só por redirecionar -- não chama setFlowState nem markPersonalPlanCompleted no caminho de cartão', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const idx = page.indexOf("if (paymentMethod === 'credit_card') {");
  const endIdx = page.indexOf('window.location.href', idx) + 100;
  const body = page.slice(idx, endIdx);
  assert.doesNotMatch(body, /setFlowState\(|markPersonalPlanCompleted\(/);
});

test('erro ao criar o checkout de cartão preserva o modal aberto com mensagem honesta -- nunca redireciona sem checkout_url', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const idx = page.indexOf('const checkoutResult = await createCheckout');
  const slice = page.slice(idx, idx + 350);
  assert.match(slice, /if \(checkoutResult\.error \|\| !checkoutResult\.data\?\.checkout_url\) \{/);
  assert.match(slice, /return;/);
});

test('modal exige CPF/CNPJ em formato válido (11 ou 14 dígitos) antes de habilitar a confirmação -- só para Pix', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /function isValidCpfCnpjFormat\(digits\) \{\s*\n\s*return digits\.length === 11 \|\| digits\.length === 14;/);
  assert.match(page, /const canSubmit = paymentMethod === 'credit_card'\s*\n\s*\? !isSubmitting\s*\n\s*: isValidCpfCnpjFormat\(digits\) && !isSubmitting;/);
});

test('cartão nunca exige CPF no modal -- o Checkout hospedado da Asaas coleta CPF/nome/endereço na própria página dele', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /paymentMethod === 'credit_card'\s*\n\s*\? !isSubmitting/);
  assert.match(page, /Você informará seus dados \(CPF, nome e endereço\) diretamente na página segura do Asaas\./);
});

test('CPF/CNPJ tem label visível associado ao input (não é só placeholder) -- só aparece para Pix', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /\{paymentMethod === 'pix' \? \(\s*\n\s*<label className={styles\.cpfField}>\s*\n\s*<span>CPF ou CNPJ/);
});

// CORREÇÃO PONTUAL: o Modal compartilhado (Modal.jsx) renderiza sobre fundo
// CLARO (--uf-color-bg-elevated), diferente do fundo escuro do resto desta
// página -- .methodOption/.cpfField tinham cor branca/transparente herdada
// do resto do módulo, invisível sobre o modal claro. Corrigido com cores
// explícitas próprias (nunca branco, nunca `inherit`), garantidas aqui.
test('modal de método/CPF usa cores explícitas próprias -- nunca branco/transparente herdado do fundo escuro da página', async () => {
  const css = await source('./PersonalPlan.module.css');
  const methodOptionIdx = css.indexOf('.methodOption {');
  const methodOptionBlock = css.slice(methodOptionIdx, css.indexOf('}', methodOptionIdx));
  assert.doesNotMatch(methodOptionBlock, /color:\s*#fff/);
  assert.doesNotMatch(methodOptionBlock, /color:\s*inherit/);
  assert.match(methodOptionBlock, /color:\s*#111827/);

  const cpfInputIdx = css.indexOf('.cpfField input {');
  const cpfInputBlock = css.slice(cpfInputIdx, css.indexOf('}', cpfInputIdx));
  assert.doesNotMatch(cpfInputBlock, /color:\s*#fff/);
  assert.match(cpfInputBlock, /background:\s*#fff/);
  assert.match(cpfInputBlock, /border:\s*1px solid #cbd5e1/);

  assert.match(css, /\.cpfField input:focus-visible \{/);
  assert.match(css, /\.methodOption\[data-disabled='true'\] \{[\s\S]*?color:\s*#64748b/);
});

test('confirmar assinatura chama createCustomer e depois createSubscription (nunca cria assinatura sem cliente)', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const idx = page.indexOf('async function handleConfirmSubscription');
  const endIdx = page.indexOf('function handleGoHome');
  const body = page.slice(idx, endIdx);
  const customerIdx = body.indexOf('createCustomer(');
  const subscriptionIdx = body.indexOf('createSubscription(');
  assert.ok(customerIdx > -1 && subscriptionIdx > customerIdx, 'createCustomer deve ser chamado ANTES de createSubscription');
  assert.match(body, /if \(customerResult\.error\) \{/);
  assert.match(body, /paymentMethod: 'pix',/);
});

test('erro em createCustomer interrompe o fluxo -- nunca tenta createSubscription mesmo assim', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const idx = page.indexOf('if (customerResult.error) {');
  const slice = page.slice(idx, idx + 220);
  assert.match(slice, /return;/);
});

// ============================================================================
// CORRECAO FINAL PIX: modal com QR Code oficial + copia-e-cola da Asaas --
// vem pronto do backend (billing-create-subscription/billing-get-
// subscription), nunca gerado/inventado no frontend.
// ============================================================================

test('confirmar assinatura Pix guarda pix (QR Code) vindo da resposta de createSubscription -- nunca gera QR no frontend', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const idx = page.indexOf('const { status, pix } = subscriptionResult.data');
  assert.ok(idx > -1);
  const slice = page.slice(idx, idx + 900);
  assert.match(slice, /setPixData\(pix\);/);
  assert.match(slice, /setFlowState\('pending'\);/);
  // GUARD FIX (modal Pix quebrado): só entra em 'pending' com payload Pix
  // real e completo -- nunca com pix ausente/incompleto.
  assert.match(slice, /if \(!isValidPixPayload\(pix\)\) \{/);
});

test('PixPaymentModal mostra QR Code como <img> com data URI base64 -- nunca desenha/gera a imagem', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const idx = page.indexOf('function PixPaymentModal');
  const slice = page.slice(idx, idx + 2000);
  assert.match(slice, /src={`data:image\/png;base64,\$\{pixData\.encoded_image\}`}/);
});

test('PixPaymentModal tem botão "Copiar código Pix" usando navigator.clipboard com o payload oficial', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const idx = page.indexOf('function PixPaymentModal');
  const slice = page.slice(idx, idx + 2000);
  assert.match(slice, /navigator\.clipboard\.writeText\(pixData\.payload\)/);
  assert.match(slice, /Copiar código Pix/);
});

test('PixPaymentModal mostra "Aguardando pagamento" e o texto de atualização automática', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const idx = page.indexOf('function PixPaymentModal');
  const slice = page.slice(idx, idx + 2000);
  assert.match(slice, /Aguardando pagamento/);
  assert.match(slice, /Assim que o Pix for confirmado, esta tela será atualizada automaticamente\./);
});

test('PixPaymentModal mostra "Pagamento confirmado" e "Seu Plano Pessoal está ativo." quando isActive', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const idx = page.indexOf('function PixPaymentModal');
  const slice = page.slice(idx, idx + 2000);
  assert.match(slice, /Pagamento confirmado\./);
  assert.match(slice, /Seu Plano Pessoal está ativo\./);
});

test('PixPaymentModal é renderizado no componente principal, aberto durante pending e durante active com pixData', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(
    page,
    /open={\(flowState === 'pending' \|\| \(flowState === 'active' && Boolean\(pixData\)\)\) && !pixModalDismissed}/,
  );
  assert.match(page, /pixData={pixData}/);
  assert.match(page, /isActive={flowState === 'active'}/);
});

test('status "pending" liga o polling (useSubscriptionStatusPolling) automaticamente, sem exigir refresh manual', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /import \{ useSubscriptionStatusPolling \} from '\.\/useSubscriptionStatusPolling\.js';/);
  assert.match(page, /active: flowState === 'pending',/);
});

test('polling detecta "active" e marca personalPlanCompleted automaticamente -- nunca por clique do usuário', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const idx = page.indexOf("if (flowState !== 'pending' || !polledSubscription?.exists) return undefined;");
  const slice = page.slice(idx, idx + 450);
  assert.match(slice, /if \(polledSubscription\.internal_status === 'active'\) \{/);
  assert.match(slice, /setFlowState\('active'\);/);
  assert.match(slice, /markPersonalPlanCompleted\(userId\);/);
});

test('consulta inicial (getSubscription) evita duplicidade: assinatura já ativa nunca oferece "assinar" de novo', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /getSubscription\(\{ workspaceId \}\)\.then/);
  assert.match(page, /if \(data\.internal_status === 'active' && !data\.cancel_at_period_end\) \{\s*\n\s*setFlowState\('already_active'\);/);
});

test('assinatura pending Pix já existente e válida é retomada (polling liga de novo), nunca uma segunda tentativa de criação', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(
    page,
    /\} else if \(data\.internal_status === 'pending' && isValidPersistedPixAttempt\(data\)\) \{[\s\S]{0,550}setPixData\(data\.pix\);\s*\n\s*setPixModalDismissed\(false\);\s*\n\s*setFlowState\('pending'\);/,
  );
});

// ============================================================================
// BUGFIX (modal Pix quebrado ao voltar da apresentação): uma assinatura
// 'pending' que NÃO é uma tentativa Pix válida (ex.: checkout de cartão
// abandonado, registro incompleto sem QR/payload) nunca pode reabrir o
// modal "Pagamento Pix" sozinha -- cai em estado neutro (idle).
// ============================================================================

test('assinatura pending SEM ser uma tentativa Pix válida (payment_method != pix, ou sem payload/QR) nunca reabre o modal quebrado -- cai em idle', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(
    page,
    /\} else if \(data\.internal_status === 'pending'\) \{\s*\n(?:\s*\/\/[^\n]*\n)*\s*setFlowState\('idle'\);/,
  );
});

test('past_due/suspended (needs_regularization) mostra caminho de regularização, nunca tenta nova assinatura', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /\} else if \(data\.needs_regularization\) \{\s*\n\s*setFlowState\('needs_regularization'\);/);
  assert.match(page, /Fale com a Uni para regularizar/);
});

test('cancel_at_period_end mostra acesso mantido até a data final, sem oferecer nova assinatura', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /flowState === 'cancel_scheduled'/);
  assert.match(page, /Seu acesso continua ativo até/);
});

test('canceled/expired volta para "idle" -- pode assinar novamente (nunca fica preso em um estado antigo)', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const idx = page.indexOf('// canceled/expired: tratado como');
  assert.ok(idx > -1);
  const slice = page.slice(idx, idx + 130);
  assert.match(slice, /setFlowState\('idle'\);/);
});

test('página apresenta preço, hero e rodapé institucional aprovados', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /PLANO PESSOAL/);
  assert.match(page, /Organize sua vida financeira conversando com a/);
  assert.match(page, /29,90/);
  assert.match(page, /Cancelamento fácil/);
  assert.match(page, /Sem taxas\. Sem burocracia\./);
  assert.match(page, /UNIFLOW AI/);
  assert.match(page, /INOVAÇÃO • CONEXÃO • CONFIANÇA • FUTURO/);
});

test('logos oficiais são importadas e a referência não é usada como background', async () => {
  const brand = await source('./PlanBrandHeader.jsx');
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(brand, /logo_uniflowai\.png/);
  assert.match(brand, /smartech_logo_transparente\.png/);
  assert.doesNotMatch(`${brand}\n${page}`, /plano_de_acesso|backgroundImage|<img[^>]+benefit/i);
});

test('rota é autenticada e renderizada fora do App Shell', async () => {
  const routes = await source('../../app/routes.jsx');
  assert.match(
    routes,
    /path: '\/plano-pessoal',[\s\S]*?standalone: true,[\s\S]*?element: <PersonalPlanPage \/>/,
  );
});

test('apresentação conclui diretamente na nova Etapa 3', async () => {
  const config = await source('../presentation/presentationConfig.js');
  assert.match(config, /PRESENTATION_NEXT_ROUTE = PERSONAL_PLAN_ROUTE/);
});

test('CSS cobre breakpoints, safe areas, foco e redução de movimento', async () => {
  const css = await source('./PersonalPlan.module.css');
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /@media \(max-width: 359px\)/);
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /@media \(min-width: 1200px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /focus-visible/);
  assert.match(css, /overflow-x: hidden/);
});

// ============================================================================
// REFINAMENTO VISUAL (bloco da parceria UniFlow AI + SmartTech) -- CAUSA
// RAIZ do corte/sobreposição visto em produção: (1) .brandFrame combinava
// overflow:hidden com uma logo forçada a width:100%+transform:scale(1.13),
// então em telas mais largas a imagem escalada excedia a caixa e a borda
// "comia" parte do símbolo; (2) .brandWave tinha margin-top NEGATIVO
// (-16px), puxando a onda para cima por cima do rodapé das logos. Corrigido
// com object-fit:contain (a logo nunca excede a caixa, nunca é cortada,
// qualquer viewport) e margin vertical sempre >= 0 (só a margem lateral,
// para a onda "sangrar" até a borda da tela, continua negativa).
// ============================================================================

test('HOTFIX (logos da parceria cortadas): .brandFrame nunca usa overflow:hidden -- a logo escala com object-fit:contain, nunca é cortada em nenhuma largura de tela', async () => {
  const css = await source('./PersonalPlan.module.css');
  const idx = css.indexOf('.brandFrame {');
  const block = css.slice(idx, css.indexOf('}', idx) + 1);
  // real CSS declaration only -- os comentários explicativos no bloco
  // mencionam "overflow:hidden" como texto (causa raiz antiga), então a
  // checagem exige o ';' de uma declaração real, nunca casa com o comentário.
  assert.doesNotMatch(block, /overflow:\s*hidden;/);
  assert.match(block, /overflow:\s*visible;/);
  const imgIdx = css.indexOf('.brandFrame img {');
  const imgBlock = css.slice(imgIdx, css.indexOf('}', imgIdx) + 1);
  assert.match(imgBlock, /object-fit:\s*contain/);
  assert.match(imgBlock, /max-width:\s*100%/);
  assert.match(imgBlock, /max-height:\s*100%/);
});

test('HOTFIX (onda sobrepondo a parceria): .brandWave nunca tem margem vertical NEGATIVA (só a margem lateral, para sangrar até a borda, pode ser negativa) -- a onda nunca mais pode ser puxada para cima, por cima das logos', async () => {
  const css = await source('./PersonalPlan.module.css');
  const idx = css.indexOf('.brandWave {');
  const block = css.slice(idx, css.indexOf('}', idx) + 1);
  const marginMatch = block.match(/margin:\s*(-?[\d.]+(?:px)?)\s+(-?[\d.]+(?:px)?)\s+(-?[\d.]+(?:px)?)/);
  assert.ok(marginMatch, 'declaração de margin não encontrada em .brandWave');
  const [, top] = marginMatch;
  assert.ok(!top.startsWith('-'), `margin-top de .brandWave precisa ser >= 0 (era ${top}) -- negativo reproduz a onda sobrepondo a parceria`);
});

test('parceria: .brandSection fica acima da onda no empilhamento (z-index), garantia extra contra sobreposição futura', async () => {
  const css = await source('./PersonalPlan.module.css');
  const idx = css.indexOf('.brandSection {');
  const block = css.slice(idx, css.indexOf('}', idx) + 1);
  assert.match(block, /z-index:\s*1/);
});

// ============================================================================
// HOTFIX (botão "Voltar para entrar ou criar conta" voltava sozinho para
// /plano-pessoal): CAUSA RAIZ -- /login é rota pública, e o guard em
// App.jsx redireciona QUALQUER usuário autenticado numa rota pública
// (/, /welcome, /login) de volta para onde ele "pertence" no funil (aqui,
// de volta para /plano-pessoal, já que a sessão continuava ativa e sem
// assinatura desbloqueada). Corrigido encerrando a sessão real (mesmo
// signOut já usado em SimplifiedAccountPage.jsx) ANTES de navegar -- só
// depois disso session vira null e /login deixa de ser redirecionado.
// ============================================================================

test('HOTFIX: botão "Voltar para entrar ou criar conta" encerra a sessão real (signOut) ANTES de navegar para /login -- nunca navega primeiro', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /signOut,\s*\n\} = useSession\(\);/);
  const idx = page.indexOf('async function handleBackToAuth() {');
  const endIdx = page.indexOf('\n  }', idx);
  const body = page.slice(idx, endIdx);
  assert.match(body, /await signOut\(\);/);
  assert.match(body, /navigate\('\/login'\);/);
  const signOutIdx = body.indexOf('await signOut();');
  const navigateIdx = body.indexOf("navigate('/login');");
  assert.ok(signOutIdx > -1 && navigateIdx > signOutIdx, 'signOut precisa acontecer ANTES do navigate -- navegar primeiro reproduz o bug (App.jsx redireciona de volta enquanto a sessão antiga ainda está ativa)');
});

test('HOTFIX: botão "Voltar para entrar ou criar conta" é protegido contra duplo clique (isReturningToAuth)', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const idx = page.indexOf('async function handleBackToAuth() {');
  const body = page.slice(idx, page.indexOf('\n  }', idx));
  assert.match(body, /if \(isReturningToAuth\) return;/);
  assert.match(body, /setIsReturningToAuth\(true\);/);
  assert.match(page, /onClick=\{handleBackToAuth\}/);
  assert.match(page, /disabled=\{isReturningToAuth\}/);
});

test('HOTFIX: causa raiz documentada -- App.jsx redireciona usuário autenticado saindo de rota pública (/, /welcome, /login) de volta ao funil, nunca deixa /login renderizar para sessão ativa', async () => {
  const app = await source('../../app/App.jsx');
  assert.match(app, /\['\/', '\/welcome', '\/login'\]\.includes\(location\.pathname\)\s*\n\s*&& session\s*\n\s*&& !sessionError/);
});
