import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyInferredTypeBlock } from './test-memory-rls.js';

test('P0001 com mensagem da trigger confirma bloqueio esperado', () => {
  assert.deepEqual(
    classifyInferredTypeBlock({
      code: 'P0001',
      message: 'Frontend may only create its own explicit memory candidates',
    }),
    { passed: true, kind: 'expected_memory_protection_trigger' },
  );
});

test('P0001 com mensagem diferente permanece falha inesperada', () => {
  assert.deepEqual(
    classifyInferredTypeBlock({ code: 'P0001', message: 'Unexpected failure' }),
    { passed: false, kind: 'unexpected_error' },
  );
});

test('42501 de permissao confirma bloqueio quando aplicavel', () => {
  assert.deepEqual(
    classifyInferredTypeBlock({
      code: '42501',
      message: 'new row violates row-level security policy',
    }),
    { passed: true, kind: 'expected_permission_denial' },
  );
});

test('ausencia de erro e tratada como falha de seguranca', () => {
  assert.deepEqual(classifyInferredTypeBlock(null), {
    passed: false,
    kind: 'missing_error',
  });
});

test('indisponibilidade nao e confundida com bloqueio seguro', () => {
  assert.deepEqual(
    classifyInferredTypeBlock({ code: 'PGRST000', message: 'Connection failed' }),
    { passed: false, kind: 'unavailable' },
  );
});

test('falha de autenticacao nao e confundida com bloqueio seguro', () => {
  assert.deepEqual(
    classifyInferredTypeBlock({ code: 'PGRST301', message: 'JWT expired' }),
    { passed: false, kind: 'authentication_failure' },
  );
});
