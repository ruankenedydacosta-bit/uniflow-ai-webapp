// Testes contratuais do Modelo Epistêmico (Fase 4).
// Itens 1-6 da especificação: serialização, status, fonte, confiança,
// evidência obrigatória, ausência de funções — mais a migração de status.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEpistemicItem,
  createEpistemicEvidence,
  validateEpistemicItem,
  validateEpistemicEvidence,
  serializeEpistemicItem,
  buildEvidenceKey,
  createEpistemicModelSection,
  isSerializableValue,
  findFunctionsInValue,
} from './epistemicContracts.js';
import {
  EPISTEMIC_SOURCES,
  EPISTEMIC_CLAIM_TYPES,
  EPISTEMIC_STATUSES,
  EPISTEMIC_EVIDENCE_TYPES,
  LEGACY_EPISTEMIC_STATUSES,
  LEGACY_STATUS_MIGRATION,
  mapLegacyEpistemicStatus,
  isValidEpistemicSource,
  isValidEpistemicStatus,
  isValidEpistemicClaimType,
  isValidEpistemicEvidenceType,
} from './epistemicTypes.js';
import { evidenceFromFinancialSnapshot } from './buildEpistemicEvidence.js';

function baseItem(overrides = {}) {
  return createEpistemicItem({
    subject: 'balance:total',
    value: 950,
    claimType: 'fact',
    epistemicStatus: 'confirmed',
    confidence: 0.9,
    source: 'financial_snapshot',
    sourcePriority: 1,
    evidence: [evidenceFromFinancialSnapshot({
      subject: 'balance:total',
      value: 950,
      observedAt: '2026-07-30T00:00:00.000Z',
    })],
    lastVerifiedAt: '2026-07-30T00:00:00.000Z',
    ...overrides,
  });
}

test('epistêmico 1: item é serializável (JSON-safe, sem funções)', () => {
  const item = baseItem();
  assert.ok(isSerializableValue(item));
  assert.doesNotThrow(() => JSON.stringify(item));
  assert.deepEqual(findFunctionsInValue(item), []);
});

test('epistêmico 2: apenas estados válidos são aceitos', () => {
  assert.equal(validateEpistemicItem(baseItem()).valid, true);
  const invalid = validateEpistemicItem(baseItem({ epistemicStatus: 'confirmed_database' }));
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.includes('ITEM_STATUS_INVALID'));
  for (const status of EPISTEMIC_STATUSES) {
    assert.equal(isValidEpistemicStatus(status), true);
  }
});

test('epistêmico 3: apenas fontes válidas são aceitas', () => {
  const invalid = validateEpistemicItem(baseItem({ source: 'banco_local' }));
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.includes('ITEM_SOURCE_INVALID'));
  for (const source of EPISTEMIC_SOURCES) {
    assert.equal(isValidEpistemicSource(source), true);
  }
});

test('epistêmico 4: confiança sempre entre 0 e 1', () => {
  assert.equal(validateEpistemicItem(baseItem({ confidence: 1.2 })).valid, false);
  assert.equal(validateEpistemicItem(baseItem({ confidence: -0.1 })).valid, false);
  assert.equal(validateEpistemicItem(baseItem({ confidence: 0 })).valid, true);
  assert.equal(validateEpistemicItem(baseItem({ confidence: 1 })).valid, true);
});

test('epistêmico 5: evidência é obrigatória — nenhuma confiança sem evidência', () => {
  const withoutEvidence = validateEpistemicItem(baseItem({ evidence: [] }));
  assert.equal(withoutEvidence.valid, false);
  assert.ok(withoutEvidence.errors.includes('ITEM_EVIDENCE_REQUIRED'));
});

test('epistêmico 6: nenhuma função na saída serializada', () => {
  const serialized = serializeEpistemicItem(baseItem());
  assert.deepEqual(findFunctionsInValue(serialized), []);
  assert.doesNotThrow(() => JSON.stringify(serialized));
});

test('epistêmico: usableFor.execution não pode ser verdadeiro em Shadow Mode', () => {
  const raw = {
    ...baseItem(),
    usableFor: { display: true, execution: true },
  };
  const result = validateEpistemicItem(raw);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('ITEM_EXECUTION_BLOCKED'));
});

test('epistêmico: createEpistemicItem força execution=false sempre', () => {
  const item = createEpistemicItem({ usableFor: { execution: true } });
  assert.equal(item.usableFor.execution, false);
});

test('epistêmico: seção do modelo garante appliedToDecision=false', () => {
  const section = createEpistemicModelSection({ items: [], appliedToDecision: true });
  assert.equal(section.appliedToDecision, false);
});

test('epistêmico: evidência valida tipo, fonte, peso e confiança', () => {
  const valid = createEpistemicEvidence({
    type: 'direct_database',
    source: 'database_record',
    value: 950,
    weight: 0.5,
    confidence: 0.5,
  });
  assert.equal(validateEpistemicEvidence(valid).valid, true);
  assert.equal(validateEpistemicEvidence({ ...valid, type: 'desconhecido' }).valid, false);
  assert.equal(validateEpistemicEvidence({ ...valid, source: 'hack' }).valid, false);
  assert.equal(validateEpistemicEvidence({ ...valid, weight: 2 }).valid, false);
  assert.equal(validateEpistemicEvidence({ ...valid, confidence: 5 }).valid, false);
  for (const type of EPISTEMIC_EVIDENCE_TYPES) {
    assert.equal(isValidEpistemicEvidenceType(type), true);
  }
});

test('epistêmico: chave de evidência é determinística e distingue observações', () => {
  const base = { type: 'direct_user_statement', source: 'user_explicit_statement', subject: 'amount', value: 50, observedAt: '2026-07-30T10:00:00.000Z' };
  assert.equal(buildEvidenceKey(base), buildEvidenceKey(base));
  assert.notEqual(
    buildEvidenceKey(base),
    buildEvidenceKey({ ...base, observedAt: '2026-07-30T11:00:00.000Z' }),
  );
});

test('epistêmico: migração de status da Fase 1 preserva compatibilidade', () => {
  assert.deepEqual(LEGACY_STATUS_MIGRATION, {
    confirmed_database: 'confirmed',
    confirmed_user: 'supported',
    inferred_high: 'probable',
    inferred_low: 'possible',
    missing: 'missing',
    conflicting: 'conflicting',
    stale: 'stale',
    ambiguous: 'ambiguous',
  });
  assert.equal(mapLegacyEpistemicStatus('confirmed_database'), 'confirmed');
  assert.equal(mapLegacyEpistemicStatus('confirmed_user'), 'supported');
  assert.equal(mapLegacyEpistemicStatus('inferred_high'), 'probable');
  assert.equal(mapLegacyEpistemicStatus('inferred_low'), 'possible');
  assert.equal(mapLegacyEpistemicStatus('missing'), 'missing');
  assert.equal(mapLegacyEpistemicStatus('conflicting'), 'conflicting');
  assert.equal(mapLegacyEpistemicStatus('stale'), 'stale');
  assert.equal(mapLegacyEpistemicStatus('ambiguous'), 'ambiguous');
  assert.equal(mapLegacyEpistemicStatus('desconhecido'), null);
  assert.deepEqual(LEGACY_EPISTEMIC_STATUSES, [
    'confirmed_database', 'confirmed_user', 'inferred_high', 'inferred_low',
    'ambiguous', 'missing', 'stale', 'conflicting',
  ]);
});

test('epistêmico: claim types fechados espelham a especificação', () => {
  assert.deepEqual(EPISTEMIC_CLAIM_TYPES, [
    'fact', 'user_claim', 'inference', 'hypothesis', 'preference',
    'correction', 'absence', 'conflict', 'temporal_state',
  ]);
  assert.equal(isValidEpistemicClaimType('user_claim'), true);
  assert.equal(isValidEpistemicClaimType('lixo'), false);
});
