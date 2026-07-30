import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CATEGORY_INFERENCE_DECISIONS,
  validateCategoryInferenceResponse,
} from './categoryInferenceContract.js';

const ALLOWED_IDS = ['category-food', 'category-transport'];

test('resposta valida com categoria existente é aceita e normalizada', () => {
  const result = validateCategoryInferenceResponse({
    decision: 'existing_category',
    category_id: 'category-food',
    confidence: 0.92,
    suggested_name: null,
    reason: 'iFood é um aplicativo de entrega de comida.',
  }, { allowedCategoryIds: ALLOWED_IDS });

  assert.equal(result.valid, true);
  assert.equal(result.inference.decision, CATEGORY_INFERENCE_DECISIONS.EXISTING_CATEGORY);
  assert.equal(result.inference.categoryId, 'category-food');
  assert.equal(result.inference.confidence, 0.92);
  assert.equal(result.inference.suggestedName, null);
  assert.match(result.inference.reason, /iFood/);
});

test('aceita string JSON bruta, não apenas objeto já parseado', () => {
  const result = validateCategoryInferenceResponse(
    JSON.stringify({ decision: 'uncertain', confidence: 0.3, reason: 'Ambíguo' }),
    { allowedCategoryIds: ALLOWED_IDS },
  );
  assert.equal(result.valid, true);
  assert.equal(result.inference.decision, 'uncertain');
});

test('decisão create_category exige suggested_name não vazio', () => {
  const valid = validateCategoryInferenceResponse({
    decision: 'create_category',
    confidence: 0.7,
    suggested_name: 'Cursos',
    reason: 'Nenhuma categoria existente cobre aula de cerâmica.',
  }, { allowedCategoryIds: ALLOWED_IDS });
  assert.equal(valid.valid, true);
  assert.equal(valid.inference.suggestedName, 'Cursos');
  assert.equal(valid.inference.categoryId, null);

  const missingName = validateCategoryInferenceResponse({
    decision: 'create_category',
    confidence: 0.7,
    suggested_name: '   ',
    reason: 'x',
  }, { allowedCategoryIds: ALLOWED_IDS });
  assert.equal(missingName.valid, false);
  assert.equal(missingName.reason, 'missing_suggested_name');
});

test('suggested_name é ignorado quando a decisão não é create_category (campo extra descartado)', () => {
  const result = validateCategoryInferenceResponse({
    decision: 'existing_category',
    category_id: 'category-food',
    confidence: 0.9,
    suggested_name: 'Não deveria aparecer',
    reason: 'x',
  }, { allowedCategoryIds: ALLOWED_IDS });
  assert.equal(result.valid, true);
  assert.equal(result.inference.suggestedName, null);
});

test('JSON inválido cai em fallback seguro', () => {
  const result = validateCategoryInferenceResponse('{ isso nao e json', { allowedCategoryIds: ALLOWED_IDS });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'invalid_json');
  assert.equal(result.inference, null);
});

test('objeto vazio, null, array ou tipos não-objeto são inválidos', () => {
  for (const value of [null, undefined, [], 'texto simples', 42, {}]) {
    const result = validateCategoryInferenceResponse(value, { allowedCategoryIds: ALLOWED_IDS });
    assert.equal(result.valid, false);
  }
});

test('category_id inexistente na lista permitida invalida a resposta', () => {
  const result = validateCategoryInferenceResponse({
    decision: 'existing_category',
    category_id: 'category-invented-by-ai',
    confidence: 0.95,
    reason: 'x',
  }, { allowedCategoryIds: ALLOWED_IDS });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'category_id_not_allowed');
});

test('categoria Business nunca é aceita -- ID de categoria business não está na allowlist pessoal enviada', () => {
  // A allowlist em si já é a defesa: o chamador nunca inclui IDs de
  // categorias Business nela (ver categoryInferencePayload.js), então uma
  // resposta apontando para um ID business (não presente aqui) é rejeitada
  // exatamente como qualquer outro ID desconhecido.
  const result = validateCategoryInferenceResponse({
    decision: 'existing_category',
    category_id: 'category-business-marketing',
    confidence: 0.9,
    reason: 'x',
  }, { allowedCategoryIds: ALLOWED_IDS });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'category_id_not_allowed');
});

test('confidence negativa é inválida', () => {
  const result = validateCategoryInferenceResponse({
    decision: 'uncertain',
    confidence: -0.1,
    reason: 'x',
  }, { allowedCategoryIds: ALLOWED_IDS });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'invalid_confidence');
});

test('confidence acima de 1 é inválida', () => {
  const result = validateCategoryInferenceResponse({
    decision: 'uncertain',
    confidence: 1.5,
    reason: 'x',
  }, { allowedCategoryIds: ALLOWED_IDS });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'invalid_confidence');
});

test('confidence não numérica é inválida', () => {
  const result = validateCategoryInferenceResponse({
    decision: 'uncertain',
    confidence: 'alta',
    reason: 'x',
  }, { allowedCategoryIds: ALLOWED_IDS });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'invalid_confidence');
});

test('decision fora do enum é inválida', () => {
  const result = validateCategoryInferenceResponse({
    decision: 'delete_transaction',
    confidence: 0.9,
    reason: 'x',
  }, { allowedCategoryIds: ALLOWED_IDS });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'invalid_decision');
});

test('reason é sempre curta (nunca uma explicação extensa) e sem caracteres de controle', () => {
  const longReason = 'x'.repeat(500);
  const result = validateCategoryInferenceResponse({
    decision: 'uncertain',
    confidence: 0.5,
    reason: longReason,
  }, { allowedCategoryIds: ALLOWED_IDS });
  assert.equal(result.valid, true);
  assert.ok(result.inference.reason.length <= 140);
});

test('a resposta nunca contém instrução de persistência -- campos extras são ignorados, nunca executados', () => {
  const result = validateCategoryInferenceResponse({
    decision: 'existing_category',
    category_id: 'category-food',
    confidence: 0.9,
    reason: 'x',
    action: 'create_transaction',
    execute: true,
    account_id: 'account-1',
  }, { allowedCategoryIds: ALLOWED_IDS });
  assert.equal(result.valid, true);
  assert.deepEqual(Object.keys(result.inference), ['decision', 'categoryId', 'confidence', 'suggestedName', 'reason']);
});

test('nenhum ID é aceito quando a allowlist enviada está vazia', () => {
  const result = validateCategoryInferenceResponse({
    decision: 'existing_category',
    category_id: 'category-food',
    confidence: 0.9,
    reason: 'x',
  }, { allowedCategoryIds: [] });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'category_id_not_allowed');
});
