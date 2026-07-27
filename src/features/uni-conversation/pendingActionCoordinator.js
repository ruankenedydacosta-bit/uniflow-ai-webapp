import {
  completePendingAction,
  confirmPendingAction,
  failPendingAction,
  getActivePendingAction,
} from './pendingActionStack.js';

function structuredError(code, message, action = null) {
  return Object.freeze({
    code,
    message,
    actionId: action?.id ?? null,
    actionType: action?.type ?? null,
  });
}
export function createPendingActionCoordinator(handlers = {}) {
  const handlerMap = new Map(Object.entries(handlers));
  let execution = null;

  return Object.freeze({
    execute(stack, { now } = {}) {
      if (execution) return execution;

      const activeAction = getActivePendingAction(stack);
      const handler = activeAction ? handlerMap.get(activeAction.type) : null;

      if (!activeAction) {
        return Promise.resolve({
          stack,
          error: structuredError('PENDING_ACTION_MISSING', 'Nenhuma ação pendente para executar.'),
        });
      }
      if (typeof handler !== 'function') {
        return Promise.resolve({
          stack,
          error: structuredError(
            'PENDING_ACTION_HANDLER_MISSING',
            'Não existe executor registrado para esta ação.',
            activeAction,
          ),
        });
      }

      const confirmed = confirmPendingAction(stack, activeAction.id, { now });
      execution = Promise.resolve()
        .then(() => handler({
          action: confirmed.activeAction,
          fields: confirmed.activeAction.fields,
          context: confirmed.activeAction.context,
        }))
        .then((result) => {
          if (result?.error) {
            const failed = failPendingAction(
              confirmed.stack,
              activeAction.id,
              result.error,
              { now },
            );
            return { ...failed, error: result.error };
          }
          return completePendingAction(
            confirmed.stack,
            activeAction.id,
            result?.data ?? result ?? null,
            { now },
          );
        })
        .catch((error) => {
          const structured = structuredError(
            error?.code ?? 'PENDING_ACTION_EXECUTION_FAILED',
            error?.message ?? 'A ação pendente falhou.',
            activeAction,
          );
          const failed = failPendingAction(
            confirmed.stack,
            activeAction.id,
            structured,
            { now },
          );
          return { ...failed, error: structured };
        })
        .finally(() => {
          execution = null;
        });

      return execution;
    },
    isExecuting() {
      return Boolean(execution);
    },
  });
}
