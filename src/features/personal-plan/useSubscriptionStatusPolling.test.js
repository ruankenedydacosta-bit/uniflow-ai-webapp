import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// ============================================================================
// BLOCO FINAL DO MVP: useSubscriptionStatusPolling.js -- cobertura
// estrutural (mesmo padrão do resto do projeto, sem @testing-library/react
// nem ambiente de hooks instalado para este componente).
// ============================================================================

const SOURCE = readFileSync(new URL('./useSubscriptionStatusPolling.js', import.meta.url), 'utf8');

test('só chama getSubscription (billing-get-subscription) -- nunca outra função de billing', () => {
  assert.match(SOURCE, /import \{ getSubscription \} from '\.\.\/\.\.\/services\/billingService\.js';/);
  assert.doesNotMatch(SOURCE, /createSubscription|createCustomer|cancelSubscription/);
});

test('não faz nada quando "active" é false ou workspaceId ausente -- nunca inicia um timer nesse caso', () => {
  assert.match(SOURCE, /if \(!active \|\| !workspaceId\) \{/);
  assert.match(SOURCE, /return undefined;/);
});

test('para automaticamente em active/canceled/expired (TERMINAL_STATUSES)', () => {
  assert.match(SOURCE, /const TERMINAL_STATUSES = new Set\(\['active', 'canceled', 'expired'\]\);/);
  assert.match(SOURCE, /const isTerminal = Boolean\(data\?\.exists && TERMINAL_STATUSES\.has\(data\.internal_status\)\);/);
});

test('tem um limite máximo de tentativas -- nunca um loop indefinido mesmo se nunca chegar a um estado terminal', () => {
  assert.match(SOURCE, /const reachedLimit = attemptsRef\.current >= maxAttempts;/);
  assert.match(SOURCE, /if \(isTerminal \|\| reachedLimit \|\| cancelled\) \{/);
});

test('erro de rede preserva o último status conhecido -- nunca limpa `status` ao falhar', () => {
  const idx = SOURCE.indexOf('if (fetchError) {');
  const slice = SOURCE.slice(idx, idx + 150);
  assert.match(slice, /setError\(fetchError\);/);
  assert.doesNotMatch(slice, /setStatus\(null\)|setStatus\(undefined\)/);
});

test('cleanup do efeito cancela a próxima chamada e limpa o timeout -- nunca dois timers concorrentes', () => {
  const idx = SOURCE.indexOf('return () => {');
  const slice = SOURCE.slice(idx, idx + 150);
  assert.match(slice, /cancelled = true;/);
  assert.match(slice, /if \(timeoutId\) window\.clearTimeout\(timeoutId\);/);
});

test('intervalo e limite de tentativas têm defaults sensatos (não exige configuração para uso básico)', () => {
  assert.match(SOURCE, /const DEFAULT_INTERVAL_MS = 4000;/);
  assert.match(SOURCE, /const DEFAULT_MAX_ATTEMPTS = 30;/);
});
