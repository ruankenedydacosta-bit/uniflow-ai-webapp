import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PERSONAL_PLAN_BENEFITS,
  PERSONAL_PLAN_ID,
  PERSONAL_PLAN_ROUTE,
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

// REDESIGN APP-LIKE: os seis recursos passaram a ser uma lista nativa
// (ícone + título + UMA descrição curta). "Controle de contas" saiu e
// "Agenda integrada" entrou, conforme a referência aprovada.
test('recursos possuem exatamente os seis itens aprovados, todos com descrição de uma linha', () => {
  assert.equal(PERSONAL_PLAN_BENEFITS.length, 6);
  assert.deepEqual(
    PERSONAL_PLAN_BENEFITS.map(({ title }) => title),
    [
      'Registros por voz',
      'Categorias inteligentes',
      'Converse com a Uni',
      'Agenda integrada',
      'Resumo financeiro',
      'Histórico completo',
    ],
  );
  // A lista nativa mostra exatamente uma linha de apoio por recurso: nenhum
  // item pode voltar a ter `lines` (bullets = aspecto de landing page).
  for (const benefit of PERSONAL_PLAN_BENEFITS) {
    assert.equal(typeof benefit.description, 'string');
    assert.ok(benefit.description.trim().length > 0);
    assert.equal('lines' in benefit, false);
  }
  assert.equal(Object.isFrozen(PERSONAL_PLAN_BENEFITS), true);
  assert.equal(Object.isFrozen(PERSONAL_PLAN_BENEFITS[0]), true);
});

// REDESIGN APP-LIKE: os quatro selos comerciais gigantes ("Dados
// protegidos", "Tecnologia segura", "Suporte humano", "Feito para facilitar
// sua vida") foram removidos junto com PERSONAL_PLAN_TRUST_SEALS. A
// informação essencial sobreviveu, discreta, num único card de garantia.
test('selos comerciais foram removidos -- resta um único card discreto de garantia', async () => {
  const config = await source('./personalPlanConfig.js');
  const indexSource = await source('./index.js');
  const page = await source('./PersonalPlanPage.jsx');
  assert.doesNotMatch(config, /PERSONAL_PLAN_TRUST_SEALS/);
  assert.doesNotMatch(indexSource, /PERSONAL_PLAN_TRUST_SEALS/);
  assert.doesNotMatch(page, /PERSONAL_PLAN_TRUST_SEALS|TrustSealIcon/);
  assert.doesNotMatch(page, /Dados protegidos|Tecnologia segura|Suporte humano|Feito para facilitar sua vida/);
  assert.match(page, /Cancele quando quiser\./);
  assert.match(page, /Pagamento seguro processado pelo Asaas\./);
});

// A demonstração "Você fala. A Uni organiza." é apresentação pura: nunca
// cria transação, nunca chama a Uni Engine, nunca usa dado real do usuário.
test('demonstração da Uni é estática -- nenhum request, nenhuma Uni Engine, nenhum dado real', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const demo = page.slice(
    page.indexOf('<section className={styles.demoCard}'),
    page.indexOf('<section className={styles.assuranceCard}'),
  );
  assert.ok(demo.length > 0, 'bloco de demonstração não encontrado');
  assert.match(demo, /PERSONAL_PLAN_VOICE_DEMO\.utterance/);
  assert.match(demo, /PERSONAL_PLAN_VOICE_DEMO\.amount/);
  assert.doesNotMatch(demo, /useState|useEffect|fetch|await|onClick|transactionService|uniEngine|createTransaction/i);
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
  // REDESIGN APP-LIKE: o CTA gigante do meio da página deu lugar à barra
  // fixa inferior ("ASSINAR AGORA"), que chama o MESMO handler.
  assert.match(page, /ASSINAR AGORA/);
  assert.doesNotMatch(page, /ASSINAR PLANO PESSOAL/);
});

// REDESIGN APP-LIKE: a barra fixa é o único CTA de assinatura e só existe
// para quem realmente pode assinar -- nunca reabre checkout de quem já pagou.
test('CTA fixo só aparece nos estados em que assinar é possível, e nunca duplica o fluxo de checkout', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /const canSubscribe = flowState === 'idle'\s*\n\s*\|\| flowState === 'checking'\s*\n\s*\|\| flowState === 'method_modal';/);
  assert.match(page, /\{canSubscribe \? \(/);
  const ctaBar = page.slice(page.indexOf('{canSubscribe ? ('), page.indexOf('<SubscriptionMethodModal'));
  assert.match(ctaBar, /onClick=\{handleBeginCheckout\}/);
  assert.match(ctaBar, /disabled=\{flowState === 'checking'\}/);
  // A barra nunca chama billing direto -- só o handler que abre o modal.
  assert.doesNotMatch(ctaBar, /createCustomer|createSubscription|createCheckout|getSubscription/);
});

// A seta do topo é a ÚNICA saída da página. Ela precisa continuar encerrando
// a sessão antes de navegar (ver HOTFIX mais abaixo): /plano-pessoal é o
// destino do guard para usuário autenticado sem assinatura, então um
// navigate(-1) puro devolveria o usuário para esta mesma tela.
test('topo tem apenas a seta de voltar e o título -- nenhum segundo botão grande de voltar', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const topBar = page.slice(page.indexOf('<header className={styles.topBar}>'), page.indexOf('<div className={styles.content}>'));
  assert.match(topBar, /className=\{styles\.backButton\}/);
  assert.match(topBar, /aria-label="Voltar para entrar ou criar conta"/);
  assert.match(topBar, /Plano Pessoal<\/h1>/);
  assert.doesNotMatch(page, /backToAuthLink/);
  // A seta nunca dispara cobrança.
  assert.doesNotMatch(topBar, /handleBeginCheckout|createCustomer|createSubscription|createCheckout/);
});

// REDESIGN APP-LIKE: o preço aparece em dois lugares (card do plano e barra
// fixa) e AMBOS vêm da fonte central -- nunca de um literal duplicado.
test('preço da apresentação vem da fonte central nos dois pontos em que aparece', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const presentation = page.slice(page.indexOf('<main className={styles.page}>'));
  assert.match(presentation, /\{priceCurrency\}/);
  assert.match(presentation, /\{priceAmount\}/);
  assert.match(presentation, /\{PERSONAL_PLAN_PRICE_LABEL\}/);
  assert.match(presentation, /\{PERSONAL_PLAN_PRICE_PERIOD\}/);
  assert.doesNotMatch(presentation, /R\$ ?29,90|>29,90</);
  // O rótulo central é apenas FATIADO para o desenho, nunca reescrito.
  assert.match(page, /function splitPriceLabel\(label\)/);
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

// REDESIGN CHECKOUT: a copy do cartão passou a ser "Pagamento processado
// com segurança pelo Asaas" (card premium com título e subtítulo próprios).
// A invariante continua a mesma: dizer honestamente que o pagamento
// acontece NO Asaas, nunca dentro da UniFlow.
test('modal de método: texto do cartão é honesto sobre onde o pagamento acontece (Asaas)', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /<strong>Cartão de crédito<\/strong>/);
  assert.match(page, /<small>Pagamento processado com segurança pelo Asaas<\/small>/);
});

// GUARD FIX: PersonalPlanPage.jsx agora cria o workspace pessoal sob
// demanda (createWorkspaceProfile('personal')) quando o usuário ainda não
// tem um -- resolvedWorkspaceId é workspaceId já existente OU o recém-criado.
//
// CORRECAO NOTIFICACOES (cartao): cartão passou a chamar createCustomer
// ANTES de createCheckout (garante/reutiliza o customer com
// notificationDisabled:true antes do Checkout hospedado) -- nunca
// createSubscription (isso continua exclusivo do Pix).
test('confirmar com cartão chama createCustomer ANTES de createCheckout (nunca createSubscription) e redireciona na MESMA aba para checkout_url', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const idx = page.indexOf("if (paymentMethod === 'credit_card') {");
  const endIdx = page.indexOf('let customerResult;', idx);
  const body = page.slice(idx, endIdx);
  const cardCustomerIdx = body.indexOf('createCustomer(');
  const checkoutIdx = body.indexOf('await createCheckout(');
  assert.ok(cardCustomerIdx > -1 && checkoutIdx > cardCustomerIdx, 'createCustomer deve ser chamado ANTES de createCheckout no fluxo de cartão');
  assert.match(body, /await createCheckout\(\{ workspaceId: resolvedWorkspaceId \}\)/);
  assert.match(body, /window\.location\.href = checkoutResult\.data\.checkout_url;/);
  assert.doesNotMatch(body, /createSubscription\(/);
});

test('cartão: createCustomer é AWAITED (sequencial, nunca em paralelo) antes de createCheckout -- se falhar, o Checkout nunca abre', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const idx = page.indexOf("if (paymentMethod === 'credit_card') {");
  const endIdx = page.indexOf('const checkoutResult = await createCheckout', idx);
  const body = page.slice(idx, endIdx);
  assert.match(body, /let cardCustomerResult;/);
  assert.match(body, /cardCustomerResult = await withTimeout\(\s*\n\s*createCustomer\(\{ workspaceId: resolvedWorkspaceId, cpfCnpj \}\),/);
  assert.match(body, /if \(cardCustomerResult\.error\) \{[\s\S]*?setIsSubmitting\(false\);[\s\S]*?return;\s*\}/);
});

test('cartão: erro/timeout ao preparar o customer nunca chama createCheckout nem redireciona', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const idx = page.indexOf("if (paymentMethod === 'credit_card') {");
  const checkoutIdx = page.indexOf('const checkoutResult = await createCheckout', idx);
  const body = page.slice(idx, checkoutIdx);
  assert.doesNotMatch(body, /createCheckout\(|window\.location\.href/);
  assert.match(body, /\} catch \{[\s\S]*?setSubmitError\([^)]*\);[\s\S]*?setIsSubmitting\(false\);[\s\S]*?return;\s*\}/);
});

// CORRECAO NOTIFICACOES (cartao) -- PRIVACIDADE: CPF/CNPJ nunca pode vazar
// para localStorage, console/log ou qualquer construção de URL, mesmo
// agora que o cartão também o coleta. cpfCnpj/digits só podem existir como
// estado local do React e como argumento das chamadas de billing
// (createCustomer) -- nunca em mais lugar nenhum do arquivo.
test('CPF/CNPJ (cpfCnpj/digits) nunca vai para localStorage, console.log/error ou é usado para montar uma URL', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const suspiciousLines = page
    .split('\n')
    .filter((line) => /\bcpfCnpj\b|\bdigits\b/.test(line))
    .filter((line) => /localStorage|console\.(log|error|warn|info|debug)|new URL\(|location\.href\s*=|`[^`]*\$\{/.test(line));
  assert.deepEqual(suspiciousLines, []);
});

// CORRECAO NOTIFICACOES (cartao) -- PRIVACIDADE: nenhum tracker de GA4
// (checkoutEventLifecycle.*) recebe CPF/CNPJ como parâmetro -- os eventos
// comerciais (payment_method_selected, card_checkout_created,
// pix_generated) continuam com o contrato de zero dado financeiro/pessoal
// já garantido pela camada de analytics (ga4ProductContracts.js), mas essa
// garantia também é verificada aqui, na origem da chamada.
test('CPF/CNPJ nunca é passado para nenhum tracker de analytics (checkoutEventLifecycle.*)', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const trackerCalls = [...page.matchAll(/checkoutEventLifecycle\.[a-zA-Z]+\([^)]*\)/g)].map((m) => m[0]);
  assert.ok(trackerCalls.length > 0, 'deveria haver ao menos uma chamada a checkoutEventLifecycle para esta checagem fazer sentido');
  for (const call of trackerCalls) {
    assert.doesNotMatch(call, /cpfCnpj|digits/);
  }
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

test('modal exige CPF/CNPJ em formato válido (11 ou 14 dígitos) antes de habilitar a confirmação -- para os DOIS métodos (Pix e cartão)', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /function isValidCpfCnpjFormat\(digits\) \{\s*\n\s*return digits\.length === 11 \|\| digits\.length === 14;/);
  assert.match(page, /const canSubmit = isValidCpfCnpjFormat\(digits\) && !isSubmitting;/);
  assert.doesNotMatch(page, /paymentMethod === 'credit_card'\s*\n\s*\? !isSubmitting/);
});

// CORRECAO NOTIFICACOES (cartao): CPF/CNPJ passou a ser exigido também no
// cartão -- billing-create-customer precisa dele para garantir/reutilizar
// o customer ANTES do Checkout (só assim o Checkout usa
// `customer: asaas_customer_id`, sem deixar a Asaas criar um cliente sem
// notificationDisabled). Nome/endereço/dados do cartão continuam
// exclusivamente na página hospedada da Asaas.
test('cartão TAMBÉM exige CPF/CNPJ no modal agora -- só nome/endereço/dados do cartão continuam na página segura do Asaas', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /Nome, endereço e dados do cartão serão informados diretamente na página segura do Asaas\./);
  assert.doesNotMatch(page, /Você informará seus dados \(CPF, nome e endereço\) diretamente na página segura do Asaas\./);
});

test('CPF/CNPJ tem label visível associado ao input (não é só placeholder) -- aparece para os DOIS métodos, nunca condicionado a paymentMethod === \'pix\'', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /<label className={styles\.cpfField}>\s*\n\s*<span>CPF ou CNPJ<\/span>/);
  assert.doesNotMatch(page, /\{paymentMethod === 'pix' \? \(\s*\n\s*<label className={styles\.cpfField}>/);
});

// REDESIGN CHECKOUT: o Modal compartilhado (Modal.jsx) nasce com superfície
// CLARA (--uf-color-bg-elevated). As duas telas de pagamento agora a
// reapresentam em azul-marinho por className/overlayClassName/
// headerClassName/bodyClassName -- SOMENTE elas. A invariante original
// permanece: nenhuma cor herdada/transparente; todo texto precisa ser
// explícito e legível sobre a superfície real do modal (agora escura).
test('modal de método/CPF usa cores explícitas próprias, legíveis sobre a superfície escura do checkout', async () => {
  const css = await source('./PersonalPlan.module.css');

  // A superfície escura é aplicada só ao diálogo do checkout (dupla classe
  // para vencer Modal.module.css sem depender da ordem do bundle).
  assert.match(css, /\.checkoutDialog\.checkoutDialog \{/);
  assert.match(css, /\.checkoutDialog\.checkoutDialog \{[\s\S]*?color:\s*#e8f0fb/);

  const methodOptionIdx = css.indexOf('.methodOption {');
  const methodOptionBlock = css.slice(methodOptionIdx, css.indexOf('}', methodOptionIdx));
  assert.doesNotMatch(methodOptionBlock, /color:\s*inherit/);
  assert.doesNotMatch(methodOptionBlock, /color:\s*transparent/);
  assert.match(methodOptionBlock, /color:\s*#e8f0fb/);

  const cpfInputIdx = css.indexOf('.cpfField input {');
  const cpfInputBlock = css.slice(cpfInputIdx, css.indexOf('}', cpfInputIdx));
  assert.doesNotMatch(cpfInputBlock, /color:\s*inherit/);
  assert.match(cpfInputBlock, /color:\s*#f2f7ff/);
  // >=16px evita o zoom automático do iOS ao focar o campo na PWA.
  assert.match(cpfInputBlock, /font-size:\s*16px/);

  assert.match(css, /\.cpfField input:focus-visible \{/);
  assert.match(css, /\.cpfField input\[aria-invalid='true'\] \{/);
  assert.match(css, /\.methodOption\[data-disabled='true'\] \{[\s\S]*?color:\s*#64748b/);
});

// REDESIGN CHECKOUT: o QR Code oficial da Asaas nunca pode ser deformado
// nem perder a área branca -- proporção travada em 1:1 e fundo branco.
test('QR Code Pix mantém proporção 1:1, fundo branco e nunca é esticado', async () => {
  const css = await source('./PersonalPlan.module.css');
  const qrIdx = css.indexOf('.pixQrImage {');
  const qrBlock = css.slice(qrIdx, css.indexOf('}', qrIdx));
  assert.match(qrBlock, /aspect-ratio:\s*1 \/ 1/);
  assert.match(qrBlock, /object-fit:\s*contain/);
  assert.match(qrBlock, /background:\s*#fff/);
  assert.match(qrBlock, /max-width:\s*100%/);
});

// Escopado a partir do comentário BUGFIX que já marca o início do trecho
// exclusivo do Pix (depois do bloco de cartão, que agora TAMBÉM chama
// createCustomer, mas nunca createCustomer -- só o Pix chama
// createSubscription) -- evita ambiguidade entre os dois createCustomer(
// que agora existem no corpo do handler.
test('Pix: confirmar assinatura chama createCustomer e depois createSubscription (nunca cria assinatura sem cliente)', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const idx = page.indexOf('BUGFIX (modal Pix quebrado): timeout explícito');
  const endIdx = page.indexOf('function handleGoHome');
  assert.ok(idx > -1);
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
  const slice = page.slice(idx, idx + 1100);
  assert.match(slice, /setPixData\(pix\);/);
  assert.match(slice, /setFlowState\('pending'\);/);
  // GUARD FIX (modal Pix quebrado): só entra em 'pending' com payload Pix
  // real e completo -- nunca com pix ausente/incompleto.
  assert.match(slice, /if \(!isValidPixPayload\(pix\)\) \{/);
});

// REDESIGN CHECKOUT: o corpo do PixPaymentModal cresceu (cards de valor/
// status/QR/aviso). As asserções abaixo passam a usar o componente INTEIRO
// (até o início de PersonalPlanPage) em vez de uma janela fixa de caracteres,
// que quebrava a cada ajuste de layout sem nenhum ganho de garantia.
const pixModalSource = (page) => page.slice(
  page.indexOf('function PixPaymentModal'),
  page.indexOf('function PersonalPlanPage'),
);

test('PixPaymentModal mostra QR Code como <img> com data URI base64 -- nunca desenha/gera a imagem', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const slice = pixModalSource(page);
  assert.match(slice, /src={`data:image\/png;base64,\$\{pixData\.encoded_image\}`}/);
});

test('PixPaymentModal tem botão "Copiar código Pix" usando navigator.clipboard com o payload oficial', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const slice = pixModalSource(page);
  assert.match(slice, /navigator\.clipboard\.writeText\(pixData\.payload\)/);
  assert.match(slice, /Copiar código Pix/);
  // O conteúdo copiado continua sendo exatamente o payload oficial da Asaas
  // -- o estado `copied` é só feedback visual temporário.
  assert.match(slice, /\{copied \? 'Código Pix copiado' : 'Copiar código Pix'\}/);
});

test('PixPaymentModal mostra "Aguardando pagamento" e o texto de confirmação automática', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const slice = pixModalSource(page);
  assert.match(slice, /Aguardando pagamento/);
  assert.match(slice, /O pagamento é identificado automaticamente em poucos segundos\./);
  assert.match(slice, /A confirmação acontece automaticamente\./);
});

// REDESIGN CHECKOUT: o valor exibido vem da fonte central do plano
// (personalPlanConfig), nunca de um literal duplicado nesta tela.
test('valor do plano no checkout/Pix vem da fonte central, nunca hardcoded', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /PERSONAL_PLAN_PRICE_LABEL,/);
  const checkout = page.slice(
    page.indexOf('function SubscriptionMethodModal'),
    page.indexOf('function PersonalPlanPage'),
  );
  assert.match(checkout, /\{PERSONAL_PLAN_PRICE_LABEL\}/);
  assert.match(checkout, /\{PERSONAL_PLAN_PRICE_PERIOD\}/);
  assert.doesNotMatch(checkout, /R\$ 29,90/);
});

test('PixPaymentModal mostra "Pagamento confirmado" e "Seu Plano Pessoal está ativo." quando isActive', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const slice = pixModalSource(page);
  assert.match(slice, /Pagamento confirmado\./);
  assert.match(slice, /Seu Plano Pessoal está ativo\./);
  // O estado exibido continua derivando SOMENTE de `isActive` (polling real),
  // nunca de um estado local/simulado dentro do modal.
  assert.match(slice, /\{isActive \? \(/);
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

// REDESIGN APP-LIKE: a copy de landing page ("PLANO PESSOAL" em caixa alta,
// "Organize sua vida financeira conversando com a Uni.", "Cancelamento
// fácil. Sem taxas. Sem burocracia.", "INOVAÇÃO • CONEXÃO • CONFIANÇA •
// FUTURO") deu lugar à hierarquia de página interna de produto.
test('página apresenta a hierarquia app-like aprovada, sem a copy de landing page', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /Plano <span>Pessoal<\/span>/);
  assert.match(page, /Tudo da Uni em um só lugar\./);
  assert.match(page, /ACESSO COMPLETO/);
  assert.match(page, /Incluído no seu plano/);
  assert.match(page, /A <span>Uni<\/span> organiza\./);

  assert.doesNotMatch(page, /PLANO PESSOAL/);
  assert.doesNotMatch(page, /Organize sua vida financeira conversando com a/);
  assert.doesNotMatch(page, /Cancelamento fácil/);
  assert.doesNotMatch(page, /Sem taxas\. Sem burocracia\./);
  assert.doesNotMatch(page, /INOVAÇÃO • CONEXÃO • CONFIANÇA • FUTURO/);
  assert.doesNotMatch(page, /O QUE VOCÊ GANHA/);
});

// REDESIGN APP-LIKE: a parceria virou assinatura institucional em TEXTO no
// rodapé. Isso também tirou do carregamento da página dois PNGs de ~2,5 MB
// (logo_uniflowai.png e smartech_logo_transparente.png) que eram baixados
// só para desenhar o banner do topo.
test('parceria é assinatura institucional em texto no rodapé -- nenhum PNG de marca é carregado', async () => {
  const brand = await source('./PlanBrandHeader.jsx');
  const page = await source('./PersonalPlanPage.jsx');
  const combined = `${brand}\n${page}`;
  // Só declarações reais contam: os comentários acima explicam QUAIS PNGs
  // saíram, então a checagem exige um `import ... from '...png'` de verdade.
  assert.doesNotMatch(combined, /import\s+[^;]*from\s+'[^']*\.png'/);
  // Nenhuma imagem na APRESENTAÇÃO (o único <img> do arquivo é o QR Code
  // oficial da Asaas, dentro do modal Pix -- checkout congelado, legítimo).
  const presentation = page.slice(
    page.indexOf('<main className={styles.page}>'),
    page.indexOf('<SubscriptionMethodModal'),
  );
  assert.doesNotMatch(presentation, /<img|backgroundImage|plano_de_acesso/i);
  assert.match(brand, /UniFlow AI/);
  assert.match(brand, /Smartech/);
  assert.match(brand, /Parceria que conecta tecnologia e inteligência\./);
  // A assinatura fica no FIM do conteúdo, nunca no topo da página.
  const signatureIdx = page.indexOf('<PlanBrandSignature />');
  assert.ok(signatureIdx > page.indexOf('styles.assuranceCard'), 'a assinatura da parceria precisa vir depois da garantia, no fim da página');
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
  // env(...) é usado com fallback explícito (`, 0px`) para navegadores sem
  // safe-area -- a checagem aceita as duas formas.
  assert.match(css, /env\(safe-area-inset-top(?:,\s*0px)?\)/);
  assert.match(css, /env\(safe-area-inset-bottom(?:,\s*0px)?\)/);
  assert.match(css, /@media \(max-width: 359px\)/);
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /@media \(min-width: 1200px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /focus-visible/);
  assert.match(css, /overflow-x: hidden/);
});

// ============================================================================
// REDESIGN APP-LIKE: as três garantias abaixo protegiam bugs visuais de
// elementos que NÃO EXISTEM MAIS -- .brandFrame (moldura das logos de
// ~2,5 MB, que cortava o símbolo), .brandWave (onda decorativa com
// margin-top negativo, que subia por cima das logos) e .brandSection (banner
// de parceria no topo). Removê-los eliminou a classe inteira de bugs, então
// as garantias foram substituídas por uma que impede a volta desses
// elementos -- e por garantias do que passou a existir (CTA fixo/safe-area).
// ============================================================================

test('elementos de landing page não voltam: banner de parceria no topo, onda decorativa e molduras de logo', async () => {
  const css = await source('./PersonalPlan.module.css');
  const page = await source('./PersonalPlanPage.jsx');
  const brand = await source('./PlanBrandHeader.jsx');
  const combined = `${css}\n${page}\n${brand}`;
  for (const gone of ['brandWave', 'waveLine', 'waveGhost', 'brandFrame', 'brandSection', 'partnershipEyebrow', 'benefitsGrid', 'benefitCard', 'trustGrid', 'trustSeal', 'subscribeButton', 'accessBadge', 'pageGlow']) {
    assert.doesNotMatch(combined, new RegExp(gone), `"${gone}" pertence à antiga landing page e não deve voltar`);
  }
});

test('CTA fixo respeita safe-area e reserva espaço para o conteúdo não ficar atrás dele', async () => {
  const css = await source('./PersonalPlan.module.css');

  const ctaIdx = css.indexOf('.ctaBar {');
  const ctaBlock = css.slice(ctaIdx, css.indexOf('}', ctaIdx) + 1);
  assert.match(ctaBlock, /position:\s*fixed/);
  assert.match(ctaBlock, /bottom:\s*0/);
  assert.match(ctaBlock, /env\(safe-area-inset-bottom,\s*0px\)/);

  // O conteúdo precisa reservar altura suficiente para o último elemento
  // (assinatura da parceria) ficar visível acima da barra fixa.
  const contentIdx = css.indexOf('.content {');
  const contentBlock = css.slice(contentIdx, css.indexOf('}', contentIdx) + 1);
  assert.match(contentBlock, /padding-bottom|calc\(124px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(contentBlock, /env\(safe-area-inset-bottom,\s*0px\)/);
});

test('barra de topo é sticky e respeita a safe-area superior (notch)', async () => {
  const css = await source('./PersonalPlan.module.css');
  const idx = css.indexOf('.topBar {');
  const block = css.slice(idx, css.indexOf('}', idx) + 1);
  assert.match(block, /position:\s*sticky/);
  assert.match(block, /top:\s*0/);
  assert.match(block, /env\(safe-area-inset-top,\s*0px\)/);
});

test('seta de voltar tem área de toque confortável (>=44px) e estado de foco visível', async () => {
  const css = await source('./PersonalPlan.module.css');
  const idx = css.indexOf('.backButton {');
  const block = css.slice(idx, css.indexOf('}', idx) + 1);
  assert.match(block, /width:\s*44px/);
  assert.match(block, /height:\s*44px/);
  assert.match(css, /\.backButton:focus-visible \{/);
  assert.match(css, /\.ctaButton:focus-visible \{/);
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

// ============================================================================
// FASE 4B LITE (GA4 -- funil comercial): pix_generated, card_checkout_created
// e subscription_activated. Cobertura estrutural (mesmo padrão do resto do
// arquivo): garante que os pontos de disparo exatos existem no código-fonte
// e que nenhum deles aparece em pontos proibidos (seleção, clique antes da
// resposta, restauração de mount, leitura de estado já ativo).
// ============================================================================

test('Fase 4B Lite: PersonalPlanPage importa os lifecycles de GA4 do gateway central da camada Analytics', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /import \{\s*\n\s*createGa4CheckoutEventLifecycle,\s*\n\s*createGa4SubscriptionActivationLifecycle,\s*\n\} from '..\/analytics\/ga4ProductEvents\.js';/);
  // Cobertura repo-wide de chamada direta à tag do Google fica em
  // ga4ProductIntegration.test.js (evita duplicar/quebrar aquele scanner).
});

test('Fase 4B Lite: pix_generated dispara somente após payload Pix válido da tentativa atual, nunca na restauração de mount', async () => {
  const page = await source('./PersonalPlanPage.jsx');

  // Ponto correto: logo após confirmar isValidPixPayload(pix) na resposta de
  // createSubscription, antes de armazenar em estado.
  const validIdx = page.indexOf('if (!isValidPixPayload(pix)) {');
  assert.ok(validIdx > -1);
  const afterValid = page.slice(validIdx, validIdx + 500);
  assert.match(afterValid, /checkoutEventLifecycle\.markPixGenerated\(\);/);
  const markIdx = afterValid.indexOf('checkoutEventLifecycle.markPixGenerated();');
  const setPixIdx = afterValid.indexOf('setPixData(pix);');
  assert.ok(markIdx > -1 && setPixIdx > markIdx, 'markPixGenerated precisa acontecer antes/junto do armazenamento do pix, nunca depois de um caminho que pode não executar');

  // Nunca no restauro via getSubscription no mount (isValidPersistedPixAttempt).
  const restoreIdx = page.indexOf('isValidPersistedPixAttempt(data)');
  const restoreBlockEnd = page.indexOf("} else if (data.internal_status === 'pending') {", restoreIdx);
  const restoreBlock = page.slice(restoreIdx, restoreBlockEnd);
  assert.doesNotMatch(restoreBlock, /markPixGenerated/);
});

test('Fase 4B Lite: card_checkout_created dispara com checkout_url confirmada, antes do redirect, e o redirect nunca depende do tracking', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const idx = page.indexOf("if (paymentMethod === 'credit_card') {");
  const redirectIdx = page.indexOf('window.location.href = checkoutResult.data.checkout_url;', idx);
  const body = page.slice(idx, redirectIdx);
  assert.match(body, /if \(checkoutResult\.error \|\| !checkoutResult\.data\?\.checkout_url\) \{/);
  assert.match(body, /checkoutEventLifecycle\.markCardCheckoutCreated\(\);/);
  const errorIdx = body.indexOf('setSubmitError(');
  const markIdx = body.indexOf('checkoutEventLifecycle.markCardCheckoutCreated();');
  assert.ok(markIdx > errorIdx, 'markCardCheckoutCreated precisa vir depois do branch de erro (nunca dispara em falha/checkout_url ausente)');
  assert.ok(redirectIdx > -1 && redirectIdx > idx, 'o redirect precisa continuar existindo logo após o disparo do evento');
});

test('Fase 4B Lite: subscription_activated dispara somente nas duas transições reais observadas pelo frontend, nunca na leitura inicial de estado já ativo', async () => {
  const page = await source('./PersonalPlanPage.jsx');

  // Transição via polling (pending -> active).
  const pollingIdx = page.indexOf("if (polledSubscription.internal_status === 'active') {");
  const pollingBlock = page.slice(pollingIdx, page.indexOf('} else if', pollingIdx));
  assert.match(pollingBlock, /subscriptionActivationLifecycle\.markWitnessedActivation\(\);/);

  // Transição via resposta direta de createSubscription (status já 'active').
  const directIdx = page.indexOf("if (status === 'active') {");
  const directBlock = page.slice(directIdx, page.indexOf('return;', directIdx));
  assert.match(directBlock, /subscriptionActivationLifecycle\.markWitnessedActivation\(\);/);

  // Leitura inicial de mount (already_active) -- NUNCA deve chamar o lifecycle
  // (é uma leitura de estado pré-existente, não uma transição presenciada).
  const mountIdx = page.indexOf("if (data.internal_status === 'active' && !data.cancel_at_period_end) {");
  const mountBlockEnd = page.indexOf('} else if', mountIdx);
  const mountBlock = page.slice(mountIdx, mountBlockEnd);
  assert.doesNotMatch(mountBlock, /markWitnessedActivation/);

  // A instância do lifecycle é criada uma vez por montagem (useState), nunca recriada a cada render.
  assert.match(page, /const \[subscriptionActivationLifecycle\] = useState\(\s*\n\s*\(\) => createGa4SubscriptionActivationLifecycle\(\),\s*\n\s*\);/);
});

test('Fase 4B Lite: os três eventos comerciais novos existem no allowlist central e aceitam zero parâmetros', async () => {
  const contracts = await readFile(new URL('../analytics/ga4ProductContracts.js', import.meta.url), 'utf8');
  assert.match(contracts, /PIX_GENERATED: 'pix_generated',/);
  assert.match(contracts, /CARD_CHECKOUT_CREATED: 'card_checkout_created',/);
  assert.match(contracts, /SUBSCRIPTION_ACTIVATED: 'subscription_activated',/);
  assert.match(contracts, /\[GA4_PRODUCT_EVENT_NAMES\.PIX_GENERATED\]: Object\.freeze\(\{\}\),/);
  assert.match(contracts, /\[GA4_PRODUCT_EVENT_NAMES\.CARD_CHECKOUT_CREATED\]: Object\.freeze\(\{\}\),/);
  assert.match(contracts, /\[GA4_PRODUCT_EVENT_NAMES\.SUBSCRIPTION_ACTIVATED\]: Object\.freeze\(\{\}\),/);
});
