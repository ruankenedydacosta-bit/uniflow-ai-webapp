function createError(code, message) {
  return { data: null, error: { code, message } };
}

function getHandlers(handlers) {
  if (typeof handlers === 'function') {
    return { saveTransaction: handlers };
  }
  return handlers && typeof handlers === 'object' ? handlers : {};
}

export async function provisionAccountAndTransaction(action, handlers) {
  const { saveAccount, saveTransaction } = getHandlers(handlers);

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

  if (!account?.id) {
    return createError('ACCOUNT_REQUIRED', 'Revise a conta antes de confirmar o lançamento.');
  }

  const transactionResult = await saveTransaction({
    ...action.payload,
    account_id: account.id,
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
