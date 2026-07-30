import assert from 'node:assert/strict';
import test from 'node:test';
import { createCategoryInferenceService } from './categoryInferenceService.js';

function createSupabaseStub(accessToken = 'token-123') {
  return {
    auth: {
      getSession: async () => ({ data: { session: accessToken ? { access_token: accessToken } : null } }),
    },
  };
}

const CATEGORIES = [
  { id: 'category-food', name: 'Alimentação', applies_to: 'personal' },
  { id: 'category-transport', name: 'Transporte', applies_to: 'personal' },
];

function buildInput(overrides = {}) {
  return {
    description: 'iFood',
    transactionType: 'expense',
    categories: CATEGORIES,
    ...overrides,
  };
}

test('resposta válida retorna inference validado e nenhum error', async () => {
  const service = createCategoryInferenceService({
    supabase: createSupabaseStub(),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled: true,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        inference: {
          decision: 'existing_category',
          category_id: 'category-food',
          confidence: 0.93,
          reason: 'iFood é entrega de comida.',
        },
      }),
    }),
  });

  const { inference, error } = await service.infer(buildInput());
  assert.equal(error, null);
  assert.equal(inference.decision, 'existing_category');
  assert.equal(inference.categoryId, 'category-food');
});

test('feature flag desativada nunca chama fetch e retorna UNSUPPORTED', async () => {
  let called = false;
  const service = createCategoryInferenceService({
    supabase: createSupabaseStub(),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled: false,
    fetchImpl: async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; },
  });

  const { inference, error } = await service.infer(buildInput());
  assert.equal(inference, null);
  assert.equal(error.code, 'UNSUPPORTED');
  assert.equal(called, false);
});

test('categorias vazias nunca chamam fetch -- retorna INSUFFICIENT_INPUT', async () => {
  let called = false;
  const service = createCategoryInferenceService({
    supabase: createSupabaseStub(),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled: true,
    fetchImpl: async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; },
  });

  const { inference, error } = await service.infer(buildInput({ categories: [] }));
  assert.equal(inference, null);
  assert.equal(error.code, 'INSUFFICIENT_INPUT');
  assert.equal(called, false);
});

test('descrição vazia nunca chama fetch -- retorna INSUFFICIENT_INPUT', async () => {
  const service = createCategoryInferenceService({
    supabase: createSupabaseStub(),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled: true,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }),
  });

  const { inference, error } = await service.infer(buildInput({ description: '   ' }));
  assert.equal(inference, null);
  assert.equal(error.code, 'INSUFFICIENT_INPUT');
});

test('sessão sem token retorna UNAUTHORIZED sem chamar fetch', async () => {
  let called = false;
  const service = createCategoryInferenceService({
    supabase: createSupabaseStub(null),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled: true,
    fetchImpl: async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; },
  });

  const { error } = await service.infer(buildInput());
  assert.equal(error.code, 'UNAUTHORIZED');
  assert.equal(called, false);
});

test('401 do provedor mapeia para UNAUTHORIZED', async () => {
  const service = createCategoryInferenceService({
    supabase: createSupabaseStub(),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled: true,
    fetchImpl: async () => ({ ok: false, status: 401 }),
  });
  const { inference, error } = await service.infer(buildInput());
  assert.equal(inference, null);
  assert.equal(error.code, 'UNAUTHORIZED');
});

test('429 do provedor mapeia para RATE_LIMIT', async () => {
  const service = createCategoryInferenceService({
    supabase: createSupabaseStub(),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled: true,
    fetchImpl: async () => ({ ok: false, status: 429 }),
  });
  const { error } = await service.infer(buildInput());
  assert.equal(error.code, 'RATE_LIMIT');
});

test('503 (feature indisponível no backend) mapeia para NOT_CONFIGURED', async () => {
  const service = createCategoryInferenceService({
    supabase: createSupabaseStub(),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled: true,
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  const { error } = await service.infer(buildInput());
  assert.equal(error.code, 'NOT_CONFIGURED');
});

test('timeout aborta a requisição e retorna TIMEOUT', async () => {
  const service = createCategoryInferenceService({
    supabase: createSupabaseStub(),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled: true,
    timeoutMs: 5,
    fetchImpl: (url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }),
  });
  const { inference, error } = await service.infer(buildInput());
  assert.equal(inference, null);
  assert.equal(error.code, 'TIMEOUT');
});

test('JSON inválido na resposta HTTP retorna PARSE_ERROR', async () => {
  const service = createCategoryInferenceService({
    supabase: createSupabaseStub(),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled: true,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }),
  });
  const { error } = await service.infer(buildInput());
  assert.equal(error.code, 'PARSE_ERROR');
});

test('ID de categoria fora da allowlist enviada é rejeitado como INVALID_RESPONSE', async () => {
  const service = createCategoryInferenceService({
    supabase: createSupabaseStub(),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled: true,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        inference: {
          decision: 'existing_category',
          category_id: 'category-invented',
          confidence: 0.9,
          reason: 'x',
        },
      }),
    }),
  });
  const { inference, error } = await service.infer(buildInput());
  assert.equal(inference, null);
  assert.equal(error.code, 'INVALID_RESPONSE');
});

test('confidence fora do intervalo é rejeitada como INVALID_RESPONSE', async () => {
  const service = createCategoryInferenceService({
    supabase: createSupabaseStub(),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled: true,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        inference: { decision: 'uncertain', confidence: 42, reason: 'x' },
      }),
    }),
  });
  const { error } = await service.infer(buildInput());
  assert.equal(error.code, 'INVALID_RESPONSE');
});

test('nunca envia categorias Business no corpo da requisição', async () => {
  let sentBody = null;
  const service = createCategoryInferenceService({
    supabase: createSupabaseStub(),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    enabled: true,
    fetchImpl: async (url, options) => {
      sentBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          inference: { decision: 'uncertain', confidence: 0.2, reason: 'x' },
        }),
      };
    },
  });

  await service.infer(buildInput({
    categories: [
      ...CATEGORIES,
      { id: 'category-business', name: 'Marketing', applies_to: 'business' },
    ],
  }));

  assert.equal(sentBody.mode, 'category_inference');
  assert.ok(!sentBody.categoryInference.categories.some((c) => c.id === 'category-business'));
});
