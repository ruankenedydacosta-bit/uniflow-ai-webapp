import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  getPromotionDocumentContext,
  getPromotionRemainingSeconds,
  PERSONAL_PLAN_PROMOTION_DURATION_MS,
  PERSONAL_PLAN_PROMOTION_DOCUMENT_KEY,
  PERSONAL_PLAN_PROMOTION_STORAGE_KEY,
  resolvePromotionExpiry,
  splitPromotionCountdown,
} from './promotionalCountdown.js';

function createStorage(initialValue, initialDocumentId) {
  const values = new Map();
  if (initialValue !== undefined) {
    values.set(PERSONAL_PLAN_PROMOTION_STORAGE_KEY, String(initialValue));
  }
  if (initialDocumentId !== undefined) {
    values.set(PERSONAL_PLAN_PROMOTION_DOCUMENT_KEY, String(initialDocumentId));
  }
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('primeira entrada promocional começa com exatamente onze minutos', () => {
  const now = 1_800_000_000_000;
  const storage = createStorage();
  const expiresAt = resolvePromotionExpiry(storage, now);

  assert.equal(PERSONAL_PLAN_PROMOTION_DURATION_MS, 660_000);
  assert.equal(expiresAt, now + 660_000);
  assert.deepEqual(splitPromotionCountdown(getPromotionRemainingSeconds(expiresAt, now)), {
    hours: '00', minutes: '11', seconds: '00',
  });
});

test('refresh preserva expiresAt e a contagem da janela atual', () => {
  const expiresAt = 1_800_000_660_000;
  const storage = createStorage(expiresAt, 'document-before-refresh');

  assert.equal(resolvePromotionExpiry(storage, 1_800_000_120_000, {
    navigationType: 'reload',
    documentId: 'document-after-refresh',
  }), expiresAt);
  assert.equal(storage.getItem(PERSONAL_PLAN_PROMOTION_DOCUMENT_KEY), 'document-after-refresh');
});

test('nova entrada real sem pagamento inicia nova janela de onze minutos', () => {
  const previousExpiry = 1_800_000_660_000;
  const now = 1_800_000_300_000;
  const storage = createStorage(previousExpiry, 'previous-document');

  const expiresAt = resolvePromotionExpiry(storage, now, {
    canStartNewWindow: true,
    navigationType: 'navigate',
    documentId: 'new-document',
  });

  assert.equal(expiresAt, now + PERSONAL_PLAN_PROMOTION_DURATION_MS);
  assert.equal(storage.getItem(PERSONAL_PLAN_PROMOTION_STORAGE_KEY), String(expiresAt));
});

test('navegação interna no mesmo documento preserva a janela atual', () => {
  const expiresAt = 1_800_000_660_000;
  const storage = createStorage(expiresAt, 'same-document');

  assert.equal(resolvePromotionExpiry(storage, 1_800_000_240_000, {
    navigationType: 'navigate',
    documentId: 'same-document',
  }), expiresAt);
});

test('pagamento confirmado não cria nova janela promocional', () => {
  const storage = createStorage(undefined, 'previous-document');

  assert.equal(resolvePromotionExpiry(storage, 1_800_000_300_000, {
    canStartNewWindow: false,
    navigationType: 'navigate',
    documentId: 'new-document',
  }), null);
  assert.equal(storage.getItem(PERSONAL_PLAN_PROMOTION_STORAGE_KEY), null);
});

test('Navigation Timing diferencia refresh de nova navegação sem heurística temporal', () => {
  const runtime = {
    performance: {
      timeOrigin: 1_800_000_123_456,
      getEntriesByType: (type) => type === 'navigation' ? [{ type: 'reload' }] : [],
    },
  };

  assert.deepEqual(getPromotionDocumentContext(runtime), {
    navigationType: 'reload',
    documentId: '1800000123456',
  });
});

test('timestamp permanece fonte de verdade após atraso ou background', () => {
  const expiresAt = 1_800_000_660_000;
  assert.deepEqual(splitPromotionCountdown(getPromotionRemainingSeconds(expiresAt, 1_800_000_601_001)), {
    hours: '00', minutes: '00', seconds: '59',
  });
});

test('contador nunca produz valores negativos', () => {
  const expiresAt = 1_800_000_000_000;
  assert.equal(getPromotionRemainingSeconds(expiresAt, expiresAt + 60_000), 0);
  assert.deepEqual(splitPromotionCountdown(-1), {
    hours: '00', minutes: '00', seconds: '00',
  });
});

test('animação continua isolada por dígito e respeita movimento reduzido', async () => {
  const component = await readFile(new URL('./PromotionalCountdown.jsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('./PlanPromotionCard.module.css', import.meta.url), 'utf8');

  assert.match(component, /function CountdownDigit\(\{ value, previousValue, revision \}\)/);
  assert.match(component, /value\.split\(''\)\.map/);
  assert.match(component, /previousCountdown: currentTimer\.countdown/);
  assert.match(component, /getPromotionDocumentContext\(window\)/);
  assert.match(component, /document\.addEventListener\('visibilitychange', updateRemaining\)/);
  assert.match(css, /@keyframes countdownDigitIn/);
  assert.match(css, /@keyframes countdownDigitOut/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.countdownDigitIncoming/);
});
