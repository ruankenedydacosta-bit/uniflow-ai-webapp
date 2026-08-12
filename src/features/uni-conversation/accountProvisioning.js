function createError(code, message) {
  return { data: null, error: { code, message } };
}

function getHandlers(handlers) {
  if (typeof handlers === 'function') {
    return { saveTransaction: handlers };
  }
  return handlers && typeof handlers === 'object' ? handlers : {};
}

export function createClientOperationId(runtime = globalThis) {
  if (typeof runtime?.crypto?.randomUUID === 'function') {
    return runtime.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof runtime?.crypto?.getRandomValues === 'function') {
    runtime.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

export async function provisionAccountAndTransaction(action, handlers) {
  const { executeAtomicAction, saveAccount, saveTransaction } = getHandlers(handlers);

  if (typeof executeAtomicAction === 'function') {
    return executeAtomicAction(action);
  }

  if (typeof saveTransaction !== 'function') {
    return createError('TRANSACTION_HANDLER_MISSING', 'Não foi possível acessar o financeiro agora.');
  }

  let account = action?.account ?? null;

  if (action?.accountResolution?.status === 'will_create') {
    if (typeof saveAccount !== 'function' || !action.proposedAccount) {
      return createError('ACCOUNT_HANDLER_MISSING', 'Não foi possível preparar a nova conta agora.');
    }

    const accountResult = await saveAccount(action.proposedAccount);
    if (accountResult?.error || !accountResult?.data?.id) {
      return createError(
        accountResult?.error?.code ?? 'ACCOUNT_CREATE_FAILED',
        'Não consegui criar essa conta. Nenhum lançamento foi registrado.',
      );
    }
    account = accountResult.data;
  }

  if (action?.accountResolution?.provisioning === 'reactivate') {
    if (typeof saveAccount !== 'function' || !account?.id) {
      return createError('ACCOUNT_HANDLER_MISSING', 'Não foi possível reativar essa conta agora.');
    }

    const accountResult = await saveAccount({ is_active: true }, account.id);
    if (accountResult?.error || !accountResult?.data?.id) {
      return createError(
        accountResult?.error?.code ?? 'ACCOUNT_REACTIVATE_FAILED',
        'Não consegui reativar essa conta. Nenhum lançamento foi registrado.',
      );
    }
    account = accountResult.data;
  }

  // CONTA-OPCIONAL: receita/despesa não exigem mais conta -- só transferência
  // (precisa de origem+destino) e ajuste de saldo (o delta é calculado contra
  // o saldo de UMA conta específica, não tem sentido sem ela) continuam
  // exigindo. financialIntentAction.js já nunca deixa a ação chegar aqui com
  // status 'ready' faltando conta nesses dois casos -- esta checagem é a
  // segunda camada de defesa, não a única.
  const accountRequired = action?.transactionType === 'transfer' || action?.transactionType === 'adjustment';
  if (accountRequired && !account?.id) {
    return createError('ACCOUNT_REQUIRED', 'Revise a conta antes de confirmar o lançamento.');
  }

  const transactionResult = await saveTransaction({
    ...action.payload,
    account_id: account?.id ?? null,
  });

  if (transactionResult?.error || !transactionResult?.data) {
    return {
      data: null,
      account,
      error: transactionResult?.error ?? {
        code: 'TRANSACTION_CREATE_FAILED',
        message: 'Não consegui registrar o lançamento. A conta preparada foi preservada para uma nova tentativa.',
      },
    };
  }

  return { ...transactionResult, account };
}

export function createAccountProvisioningCoordinator(execute = provisionAccountAndTransaction) {
  let pendingExecution = null;

  return {
    execute(action, handlers) {
      if (pendingExecution) return pendingExecution;

      pendingExecution = Promise.resolve()
        .then(() => execute(action, handlers))
        .finally(() => {
          pendingExecution = null;
        });
      return pendingExecution;
    },
    isPending() {
      return Boolean(pendingExecution);
    },
  };
}
