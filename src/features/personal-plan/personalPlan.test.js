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
  assert.match(page, /onClick={\(\) => setFlowState\('method_modal'\)}/);
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
  const endIdx = page.indexOf('const customerResult = await createCustomer', idx);
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
  const customerIdx = body.indexOf('await createCustomer(');
  const subscriptionIdx = body.indexOf('await createSubscription(');
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
  const slice = page.slice(idx, idx + 550);
  assert.match(slice, /setPixData\(pix \?\? null\);/);
  assert.match(slice, /setFlowState\('pending'\);/);
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

test('assinatura pending já existente é retomada (polling liga de novo), nunca uma segunda tentativa de criação', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /\} else if \(data\.internal_status === 'pending'\) \{\s*\n\s*setPixData\(data\.pix \?\? null\);\s*\n\s*setPixModalDismissed\(false\);\s*\n\s*setFlowState\('pending'\);/);
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
