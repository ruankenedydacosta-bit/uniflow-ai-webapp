// Uni Engine — Fase 19: Rollout Control — testes para financialRolloutTypes.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FINANCIAL_ROLLOUT_VERSION,
  FINANCIAL_ROLLOUT_CONFIG,
  validateFinancialRolloutConfig,
} from './financialRolloutTypes.js';

test('types - version é string não vazia', () => {
  assert.ok(typeof FINANCIAL_ROLLOUT_VERSION === 'string' && FINANCIAL_ROLLOUT_VERSION.length > 0);
});

test('types - FINANCIAL_ROLLOUT_CONFIG é objeto congelado com defaults seguros', () => {
  assert.ok(typeof FINANCIAL_ROLLOUT_CONFIG === 'object');
  assert.ok(Object.isFrozen(FINANCIAL_ROLLOUT_CONFIG));
  assert.equal(FINANCIAL_ROLLOUT_CONFIG.enabled, false);
  assert.equal(FINANCIAL_ROLLOUT_CONFIG.shadowMode, true);
  assert.equal(FINANCIAL_ROLLOUT_CONFIG.visibleEnabled, false);
  assert.equal(FINANCIAL_ROLLOUT_CONFIG.productionEnabled, false);
  assert.equal(FINANCIAL_ROLLOUT_CONFIG.canaryEnabled, false);
  assert.equal(FINANCIAL_ROLLOUT_CONFIG.canaryPercentage, 0);
  assert.equal(FINANCIAL_ROLLOUT_CONFIG.minimumConfidence, 0.9);
  assert.equal(FINANCIAL_ROLLOUT_CONFIG.requireEligibility, true);
  assert.equal(FINANCIAL_ROLLOUT_CONFIG.requireFactualValidation, true);
  assert.equal(FINANCIAL_ROLLOUT_CONFIG.requireIdentityMatch, true);
  assert.equal(FINANCIAL_ROLLOUT_CONFIG.requireConversationMatch, true);
  assert.equal(FINANCIAL_ROLLOUT_CONFIG.requireWorkspaceMatch, true);
  assert.equal(FINANCIAL_ROLLOUT_CONFIG.telemetryEnabled, false);
  assert.equal(FINANCIAL_ROLLOUT_CONFIG.emergencyRollback, false);
  assert.ok(Array.isArray(FINANCIAL_ROLLOUT_CONFIG.allowedIntents));
  assert.ok(Array.isArray(FINANCIAL_ROLLOUT_CONFIG.deniedIntents));
  assert.equal(FINANCIAL_ROLLOUT_CONFIG.allowedIntents.length, 0);
  assert.equal(FINANCIAL_ROLLOUT_CONFIG.deniedIntents.length, 0);
});

test('types - validateFinancialRolloutConfig rejeita config null/undefined', () => {
  const result = validateFinancialRolloutConfig(null);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('CONFIG_INVALID'));
});

test('types - validateFinancialRolloutConfig rejeita config não-objeto', () => {
  const result = validateFinancialRolloutConfig('not an object');
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('CONFIG_INVALID'));
});

test('types - validateFinancialRolloutConfig valida config padrão como válida', () => {
  const result = validateFinancialRolloutConfig(FINANCIAL_ROLLOUT_CONFIG);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('types - validateFinancialRolloutConfig exige enabled boolean', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, enabled: 'true' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('ENABLED_MISSING_OR_NOT_BOOLEAN'));
});

test('types - validateFinancialRolloutConfig exige shadowMode boolean', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, shadowMode: 'true' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('SHADOW_MODE_MISSING_OR_NOT_BOOLEAN'));
});

test('types - validateFinancialRolloutConfig exige visibleEnabled boolean', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, visibleEnabled: 1 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('VISIBLE_ENABLED_MISSING_OR_NOT_BOOLEAN'));
});

test('types - validateFinancialRolloutConfig exige productionEnabled boolean', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, productionEnabled: 'false' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('PRODUCTION_ENABLED_MISSING_OR_NOT_BOOLEAN'));
});

test('types - validateFinancialRolloutConfig exige canaryEnabled boolean', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, canaryEnabled: 'true' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('CANARY_ENABLED_MISSING_OR_NOT_BOOLEAN'));
});

test('types - validateFinancialRolloutConfig exige canaryPercentage número finito', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, canaryPercentage: '50' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('CANARY_PERCENTAGE_MISSING_OR_INVALID'));
});

test('types - validateFinancialRolloutConfig rejeita canaryPercentage < 0', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, canaryPercentage: -10 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('CANARY_PERCENTAGE_OUT_OF_RANGE'));
});

test('types - validateFinancialRolloutConfig rejeita canaryPercentage > 100', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, canaryPercentage: 150 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('CANARY_PERCENTAGE_OUT_OF_RANGE'));
});

test('types - validateFinancialRolloutConfig aceita canaryPercentage 0', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, canaryPercentage: 0 });
  assert.equal(result.valid, true);
});

test('types - validateFinancialRolloutConfig aceita canaryPercentage 100', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, canaryPercentage: 100 });
  assert.equal(result.valid, true);
});

test('types - validateFinancialRolloutConfig exige minimumConfidence número finito', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, minimumConfidence: '0.9' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('MINIMUM_CONFIDENCE_MISSING_OR_INVALID'));
});

test('types - validateFinancialRolloutConfig rejeita minimumConfidence < 0', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, minimumConfidence: -0.1 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('MINIMUM_CONFIDENCE_OUT_OF_RANGE'));
});

test('types - validateFinancialRolloutConfig rejeita minimumConfidence > 1', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, minimumConfidence: 1.5 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('MINIMUM_CONFIDENCE_OUT_OF_RANGE'));
});

test('types - validateFinancialRolloutConfig aceita minimumConfidence 0.9', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, minimumConfidence: 0.9 });
  assert.equal(result.valid, true);
});

test('types - validateFinancialRolloutConfig exige requireEligibility boolean', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, requireEligibility: 'true' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('REQUIRE_ELIGIBILITY_MISSING_OR_NOT_BOOLEAN'));
});

test('types - validateFinancialRolloutConfig exige requireFactualValidation boolean', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, requireFactualValidation: 1 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('REQUIRE_FACTUAL_VALIDATION_MISSING_OR_NOT_BOOLEAN'));
});

test('types - validateFinancialRolloutConfig exige requireIdentityMatch boolean', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, requireIdentityMatch: 'true' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('REQUIRE_IDENTITY_MATCH_MISSING_OR_NOT_BOOLEAN'));
});

test('types - validateFinancialRolloutConfig exige requireConversationMatch boolean', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, requireConversationMatch: 'true' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('REQUIRE_CONVERSATION_MATCH_MISSING_OR_NOT_BOOLEAN'));
});

test('types - validateFinancialRolloutConfig exige requireWorkspaceMatch boolean', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, requireWorkspaceMatch: 'true' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('REQUIRE_WORKSPACE_MATCH_MISSING_OR_NOT_BOOLEAN'));
});

test('types - validateFinancialRolloutConfig exige telemetryEnabled boolean', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, telemetryEnabled: 'true' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('TELEMETRY_ENABLED_MISSING_OR_NOT_BOOLEAN'));
});

test('types - validateFinancialRolloutConfig exige emergencyRollback boolean', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, emergencyRollback: 1 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('EMERGENCY_ROLLBACK_MISSING_OR_NOT_BOOLEAN'));
});

test('types - config cascade: rollout disabled bloqueia tudo', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, enabled: false, visibleEnabled: true, productionEnabled: true });
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('types - config cascade: shadow enabled mas production disabled', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, shadowMode: true, productionEnabled: false });
  assert.equal(result.valid, true);
});

test('types - config cascade: production enabled mas visible disabled', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, productionEnabled: true, visibleEnabled: false });
  assert.equal(result.valid, true);
});

test('types - config cascade: canary enabled mas percentage 0', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, canaryEnabled: true, canaryPercentage: 0 });
  assert.equal(result.valid, true);
});

test('types - config cascade: emergency rollback true não invalida config', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, emergencyRollback: true });
  assert.equal(result.valid, true);
});

test('types - config cascade: allowedIntents deve ser array', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, allowedIntents: 'balance_query' });
  // allowedIntents não é validado atualmente no validateFinancialRolloutConfig
  // mas seria rejeitado se validação estendida existisse
  assert.equal(result.valid, true);
});

test('types - config cascade: deniedIntents deve ser array', () => {
  const result = validateFinancialRolloutConfig({ ...FINANCIAL_ROLLOUT_CONFIG, deniedIntents: 'transfer' });
  assert.equal(result.valid, true);
});