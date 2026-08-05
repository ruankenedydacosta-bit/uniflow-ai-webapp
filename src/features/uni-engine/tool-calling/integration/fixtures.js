// Uni Engine — Fase 20.1: Tool Calling — fixtures seguras de teste.
//
// ÚNICO lugar onde ferramentas são registradas. Produção fica SEM nenhuma
// ferramenta real: apenas estas fixtures fictícias e seguras, que nunca
// escrevem, nunca acessam rede, nunca tocam Asaas/Supabase/auth/voz/arquivos
// e nunca movimentam valores financeiros.
import { createToolCallingRegistry } from '../registry/index.js';
import { createIdempotencyStore } from '../idempotency/index.js';
import { createToolCallingDispatcher } from '../dispatcher/index.js';
import { createToolCallingTelemetryStore } from '../telemetry/index.js';

export function registerToolCallingFixtures(registry) {
  const safeRegistry = registry && typeof registry.registerTool === 'function'
    ? registry
    : createToolCallingRegistry();

  safeRegistry.registerTool({
    name: 'fixture.lookup',
    handler: ({ arguments: args }) => ({
      data: { label: typeof args?.key === 'string' ? args.key : 'unknown' },
    }),
    enabled: true,
    requiresAuthorization: true,
  });

  safeRegistry.registerTool({
    name: 'fixture.echo',
    handler: ({ arguments: args }) => ({
      data: { echoed: typeof args?.value !== 'undefined' ? args.value : null },
    }),
    enabled: true,
    requiresAuthorization: true,
  });

  // Registrada, mas desabilitada: testa o gate TOOL_DISABLED.
  safeRegistry.registerTool({
    name: 'fixture.disabled',
    handler: () => ({ data: { ok: true } }),
    enabled: false,
    requiresAuthorization: true,
  });

  // Lança erro de propósito: testa o fail-safe do executor.
  safeRegistry.registerTool({
    name: 'fixture.boom',
    handler: () => { throw new Error('BOOM'); },
    enabled: true,
    requiresAuthorization: true,
  });

  // Atraso fictício curto com timeout: testa o gate de timeout.
  safeRegistry.registerTool({
    name: 'fixture.sleep',
    handler: ({ signal }) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve({ data: { slept: true } }), 20);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('ABORTED'));
      });
    }),
    enabled: true,
    requiresAuthorization: true,
    timeoutMs: 5,
  });

  return safeRegistry;
}

// Contexto de integração completo (registry + idempotency + telemetry +
// dispatcher) pronto para os testes e para a Fase 20.1. Nenhum efeito
// colateral: tudo em memória, com telemetria desligada por padrão.
export function createToolCallingFixtureContext({ allowWrites = false, telemetryEnabled = false } = {}) {
  const registry = createToolCallingRegistry({ allowWrites });
  registerToolCallingFixtures(registry);
  const idempotency = createIdempotencyStore();
  const telemetry = createToolCallingTelemetryStore({ enabled: telemetryEnabled });
  const dispatcher = createToolCallingDispatcher({ idempotency, telemetry });
  return { registry, dispatcher, idempotency, telemetry };
}
