import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isValidPersistedPixAttempt, isValidPixPayload } from './personalPlanPixAttempt.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// BUGFIX (modal Pix quebrado ao concluir a apresentação): um registro de
// assinatura com internal_status === 'pending' NÃO é, por si só, uma
// tentativa Pix ativa -- pode ser um checkout de cartão abandonado, ou um
// registro incompleto (falha ao buscar o QR na Asaas). isValidPersistedPixAttempt
// e isValidPixPayload são a ÚNICA fonte de verdade sobre isso -- usadas
// tanto no mount (PersonalPlanPage.jsx) quanto na criação (handleConfirm-
// Subscription), nunca validações divergentes espalhadas pelo código.
// ============================================================================

test('isValidPixPayload exige payload E encoded_image não vazios -- qualquer um ausente/vazio invalida', () => {
  assert.equal(isValidPixPayload(null), false);
  assert.equal(isValidPixPayload(undefined), false);
  assert.equal(isValidPixPayload({}), false);
  assert.equal(isValidPixPayload({ payload: '', encoded_image: 'abc' }), false);
  assert.equal(isValidPixPayload({ payload: '   ', encoded_image: 'abc' }), false);
  assert.equal(isValidPixPayload({ payload: 'abc', encoded_image: '' }), false);
  assert.equal(isValidPixPayload({ payload: 'abc' }), false);
  assert.equal(isValidPixPayload({ encoded_image: 'abc' }), false);
  assert.equal(isValidPixPayload({ payload: 'copia-e-cola-real', encoded_image: 'base64real' }), true);
});

test('isValidPersistedPixAttempt: exists:false ou ausente nunca é válido', () => {
  assert.equal(isValidPersistedPixAttempt(null), false);
  assert.equal(isValidPersistedPixAttempt(undefined), false);
  assert.equal(isValidPersistedPixAttempt({ exists: false }), false);
});

test('4. storage com checkout de cartão (payment_method credit_card) nunca abre Pix, mesmo com status pending', () => {
  assert.equal(
    isValidPersistedPixAttempt({
      exists: true, internal_status: 'pending', payment_method: 'credit_card', pix: null,
    }),
    false,
  );
});

test('5. storage com Pix incompleto (payment_method pix, mas sem objeto pix) é limpo -- nunca abre modal quebrado', () => {
  assert.equal(
    isValidPersistedPixAttempt({
      exists: true, internal_status: 'pending', payment_method: 'pix', pix: null,
    }),
    false,
  );
});

test('6. storage com paymentId/pix presente mas sem payload não abre Pix', () => {
  assert.equal(
    isValidPersistedPixAttempt({
      exists: true,
      internal_status: 'pending',
      payment_method: 'pix',
      pix: { encoded_image: 'base64semPayload', payload: '' },
    }),
    false,
  );
});

test('7. storage com payload mas sem QR Code (encoded_image) válido não abre modal quebrado', () => {
  assert.equal(
    isValidPersistedPixAttempt({
      exists: true,
      internal_status: 'pending',
      payment_method: 'pix',
      pix: { payload: 'copia-e-cola', encoded_image: '' },
    }),
    false,
  );
});

test('status diferente de "pending" (active/canceled/expired) nunca é uma tentativa Pix restaurável, mesmo com payment_method/pix completos', () => {
  const fullPix = { payload: 'copia-e-cola', encoded_image: 'base64' };
  for (const status of ['active', 'canceled', 'expired', 'past_due', 'suspended']) {
    assert.equal(
      isValidPersistedPixAttempt({ exists: true, internal_status: status, payment_method: 'pix', pix: fullPix }),
      false,
      `status ${status} não deveria validar`,
    );
  }
});

test('tentativa Pix genuína (method pix + pending + payload/QR completos) É válida -- só esse conjunto restaura o modal automaticamente', () => {
  assert.equal(
    isValidPersistedPixAttempt({
      exists: true,
      internal_status: 'pending',
      payment_method: 'pix',
      pix: { payload: 'copia-e-cola-real', encoded_image: 'base64real' },
    }),
    true,
  );
});

// ============================================================================
// Testes estruturais em PersonalPlanPage.jsx -- garantem que a função
// central (não uma validação divergente local) é quem decide.
// ============================================================================

test('1/2/3. mount neutro (workspace sem assinatura, ou storage vazio) nunca abre modal -- flowState vira idle, nunca pending', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /if \(!workspaceId\) \{\s*\n\s*setFlowState\('idle'\);/);
  assert.match(page, /if \(error \|\| !data\?\.exists\) \{\s*\n\s*setFlowState\('idle'\);/);
});

test('mount usa isValidPersistedPixAttempt (função central) -- nunca uma checagem solta de internal_status === "pending" sozinha', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /import \{ isValidPersistedPixAttempt, isValidPixPayload \} from '\.\/personalPlanPixAttempt\.js';/);
  assert.match(page, /data\.internal_status === 'pending' && isValidPersistedPixAttempt\(data\)/);
});

test('8. nenhum polling inicia no mount neutro -- useSubscriptionStatusPolling só fica active quando flowState já é "pending" (nunca no valor inicial "checking"/"idle")', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /const \[flowState, setFlowState\] = useState\('checking'\);/);
  assert.match(page, /active: flowState === 'pending',/);
});

test('9. nenhuma função de criação de cobrança (createCustomer/createSubscription/createCheckout) é chamada dentro do efeito de mount', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const mountEffectIdx = page.indexOf('useEffect(() => {\n    let cancelled = false;');
  const mountEffectEndIdx = page.indexOf('}, [workspaceId]);');
  const mountEffectBody = page.slice(mountEffectIdx, mountEffectEndIdx);
  assert.doesNotMatch(mountEffectBody, /createCustomer\(|createSubscription\(|createCheckout\(/);
  assert.match(mountEffectBody, /getSubscription\(\{ workspaceId \}\)/);
});

test('10. clicar explicitamente em Pix (handleConfirmSubscription) chama createCustomer/createSubscription com timeout -- só ação explícita cria cobrança', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /const PIX_CREATION_TIMEOUT_MS = 20000;/);
  assert.match(page, /function withTimeout\(promise, ms\) \{/);
  const handlerBody = page.slice(
    page.indexOf('async function handleConfirmSubscription'),
    page.indexOf('function handleGoHome'),
  );
  assert.match(handlerBody, /withTimeout\(\s*\n\s*createCustomer\(/);
  assert.match(handlerBody, /withTimeout\(\s*\n\s*createSubscription\(/);
});

test('11. sucesso real (payload/QR completos) mostra QR Code, payload e liga o polling -- via isValidPixPayload antes de setFlowState(pending)', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const handlerBody = page.slice(
    page.indexOf('async function handleConfirmSubscription'),
    page.indexOf('function handleGoHome'),
  );
  assert.match(handlerBody, /if \(!isValidPixPayload\(pix\)\) \{/);
  assert.match(handlerBody, /setPixData\(pix\);\s*\n\s*setPixModalDismissed\(false\);\s*\n\s*setFlowState\('pending'\);/);
});

test('12. botão "Copiar código Pix" só aparece habilitado com payload -- disabled={!pixData?.payload}', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.match(page, /disabled={!pixData\?\.payload}/);
});

test('13. erro ao criar Pix (rejeição/timeout) mostra mensagem recuperável, nunca deixa o modal em loading infinito', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  const handlerBody = page.slice(
    page.indexOf('async function handleConfirmSubscription'),
    page.indexOf('function handleGoHome'),
  );
  assert.match(handlerBody, /\} catch \{[\s\S]{0,260}setSubmitError\('A geração do Pix demorou demais\. Tente novamente em instantes\.'\);\s*\n\s*setIsSubmitting\(false\);\s*\n\s*return;/);
  assert.match(handlerBody, /if \(!isValidPixPayload\(pix\)\) \{\s*\n\s*setSubmitError\('Não foi possível gerar o QR Code Pix agora\. Tente novamente em instantes\.'\);/);
});

test('14/15. guard de assinatura (App.jsx) permanece intocado por esta correção -- usuário sem assinatura continua bloqueado, ativo nunca abre checkout', async () => {
  const app = await readFile(new URL('../../app/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /if \(isPersonalPlanRoute && personalPlanUnlocked\) \{\s*\n\s*return <Navigate to=\{SIMPLIFIED_ROUTES\.HOME\} replace \/>;/);
});

test('nenhuma validação de tentativa Pix é feita fora de personalPlanPixAttempt.js -- função central, nunca duplicada', async () => {
  const page = await source('./PersonalPlanPage.jsx');
  assert.doesNotMatch(page, /payment_method === 'pix'/);
  assert.doesNotMatch(page, /\.encoded_image &&.*\.payload|\.payload &&.*\.encoded_image/);
});
