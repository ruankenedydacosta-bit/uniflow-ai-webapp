import { useCallback, useMemo, useReducer, useRef } from 'react';
import {
  createConversationContext,
  parseFinancialText,
} from '../uni-intents/index.js';
import {
  buildFinancialIntentAction,
  executeFinancialIntentAction,
} from './financialIntentAction.js';
import {
  createAccountProvisioningCoordinator,
  createClientOperationId,
} from './accountProvisioning.js';
import {
  initialUniConversationState,
  uniConversationReducer,
} from './uniConversationReducer.js';
import {
  buildCanceledResponse,
  buildClarificationResponse,
  buildCompletionResponse,
  buildConfirmationResponse,
  buildExecutionErrorResponse,
} from './uniResponseBuilder.js';
import { trackGa4ConfirmedTransactionCreation } from '../analytics/ga4ProductEvents.js';
import {
  GA4_PRODUCT_ORIGINS,
} from '../analytics/ga4ProductContracts.js';

export function useUniConversation({
  accounts = [],
  accountTypes = [],
  categories = [],
  executeAtomicAction,
  saveAccount,
  saveTransaction,
  profileId = 'balanced',
  workspaceType = 'personal',
  cognitiveMap,
  referenceDate,
  resolveParsedMemory,
  allowedWriteIntents,
  accountBalances = null,
} = {}) {
  const [state, dispatch] = useReducer(
    uniConversationReducer,
    initialUniConversationState,
  );
  const contextRef = useRef(createConversationContext());
  const overridesRef = useRef({});
  const analyticsOriginRef = useRef(GA4_PRODUCT_ORIGINS.MANUAL);
  const confirmationPromiseRef = useRef(null);
  const provisioningCoordinator = useMemo(
    () => createAccountProvisioningCoordinator(executeFinancialIntentAction),
    [],
  );
  const responseOptions = useMemo(
    () => ({ profileId, workspaceType, cognitiveMap }),
    [cognitiveMap, profileId, workspaceType],
  );

  const buildAction = useCallback(
    (parsed, overrides = {}) => {
      if (
        Array.isArray(allowedWriteIntents)
        && !allowedWriteIntents.includes(parsed?.intent)
      ) {
        return { status: 'unsupported', intent: parsed?.intent ?? 'question', issues: [] };
      }
      const action = buildFinancialIntentAction({
        parsed,
        accounts: overrides.accountRecord
          ? [
              overrides.accountRecord,
              ...accounts.filter((account) => account.id !== overrides.accountRecord.id),
            ]
          : accounts,
        accountTypes,
        categories: overrides.categoryRecord
          ? [
              overrides.categoryRecord,
              ...categories.filter((category) => category.id !== overrides.categoryRecord.id),
            ]
          : categories,
        referenceDate,
        overrides,
        workspaceType,
        accountBalances,
      });
      return {
        ...action,
        analyticsOrigin: overrides.analyticsOrigin === GA4_PRODUCT_ORIGINS.VOICE
          ? GA4_PRODUCT_ORIGINS.VOICE
          : GA4_PRODUCT_ORIGINS.MANUAL,
      };
    },
    [accountBalances, accountTypes, accounts, allowedWriteIntents, categories, referenceDate, workspaceType],
  );

  const interpret = useCallback((content) => {
    dispatch({ type: 'INTERPRET' });
    const clientOperationId = createClientOperationId();
    overridesRef.current = {
      clientOperationId,
      analyticsOrigin: analyticsOriginRef.current,
    };
    const parsed = parseFinancialText(content, {
      context: contextRef.current,
      referenceDate,
    });
    contextRef.current = parsed.nextContext;
    const memory = typeof resolveParsedMemory === 'function'
      ? resolveParsedMemory(parsed, { accounts, categories, profileId })
      : null;
    const parsedForAction = memory?.resolvedResult ?? parsed;
    overridesRef.current = {
      ...memory?.memoryOverrides,
      clientOperationId,
      analyticsOrigin: overridesRef.current.analyticsOrigin,
    };
    const action = buildAction(parsedForAction, overridesRef.current);

    if (action.status === 'unsupported') {
      dispatch({ type: 'RESET' });
      return { handled: false, parsed, action };
    }

    if (memory?.conflicts?.length) {
      const conflict = memory.conflicts[0];
      const conflictAction = {
        ...action,
        status: 'needs_clarification',
        payload: null,
        issues: [{
          field: conflict.field,
          code: 'memory_conflict',
          candidates: conflict.field === 'account'
            ? action.options.accounts
            : action.options.categories,
        }],
        memoryConflict: conflict,
      };
      const response = { text: conflict.explanation };
      dispatch({
        type: 'NEEDS_CLARIFICATION',
        parsed: parsedForAction,
        action: conflictAction,
        response: response.text,
        memory,
      });
      return { handled: true, parsed: parsedForAction, action: conflictAction, response, memory };
    }

    if (action.status === 'needs_clarification') {
      const response = buildClarificationResponse(action, responseOptions);
      dispatch({
        type: 'NEEDS_CLARIFICATION',
        parsed: parsedForAction,
        action,
        response: response.text,
        memory,
      });
      return { handled: true, parsed: parsedForAction, action, response, memory };
    }

    const response = buildConfirmationResponse(action, responseOptions);
    dispatch({
      type: 'AWAIT_CONFIRMATION',
      parsed: parsedForAction,
      action,
      response: response.text,
      memory,
    });
    return { handled: true, parsed: parsedForAction, action, response, memory };
  }, [accounts, buildAction, categories, profileId, referenceDate, resolveParsedMemory, responseOptions]);

  // BUG REAL EM PRODUCAO: quando provideInput/correct é chamado NO MESMO
  // turno em que interpret() acabou de rodar (ex.: attemptCategoryInference
  // em UniChatPage.jsx, que faz isso de forma síncrona logo após o
  // interpret original, antes de qualquer re-render) -- state.parsed ainda
  // reflete o turno ANTERIOR (ou null, no primeiro turno da conversa), não
  // o parsed que acabou de ser calculado por interpret(). O parametro
  // parsedOverride deixa quem já tem o valor fresco (o retorno de
  // interpret()) passá-lo explicitamente, sem depender do commit do
  // useReducer. Chamadas normais (resposta a uma pendência de turno
  // anterior, já com um re-render de por meio) continuam usando
  // state.parsed via fallback -- nenhum comportamento existente muda.
  const correct = useCallback((overrides, parsedOverride) => {
    const parsed = parsedOverride ?? state.parsed;
    if (!parsed) return null;
    overridesRef.current = { ...overridesRef.current, ...overrides };
    const action = buildAction(parsed, overridesRef.current);
    const response = action.status === 'ready'
      ? buildConfirmationResponse(action, responseOptions)
      : buildClarificationResponse(action, responseOptions);
    dispatch({
      type: action.status === 'ready' ? 'AWAIT_CONFIRMATION' : 'NEEDS_CLARIFICATION',
      parsed,
      action,
      response: response.text,
      memory: state.memory,
    });
    return { action, response };
  }, [buildAction, responseOptions, state.memory, state.parsed]);

  const confirm = useCallback(async () => {
    if (state.action?.status !== 'ready') return null;
    if (confirmationPromiseRef.current) return confirmationPromiseRef.current;

    const confirmationPromise = (async () => {
      dispatch({ type: 'EXECUTE' });
      const result = await provisioningCoordinator.execute(state.action, {
        executeAtomicAction,
        saveAccount,
        saveTransaction,
      });

      if (result?.error || !result?.data) {
        const error = result?.error ?? { message: 'O lançamento não retornou confirmação.' };
        const response = buildExecutionErrorResponse(error, responseOptions);
        dispatch({ type: 'FAIL', error, response: response.text });
        return { result, response };
      }

      trackGa4ConfirmedTransactionCreation({
        confirmed: true,
        idempotentReplay: result.data.idempotent_replay !== false,
        transactionType: state.action.transactionType,
        origin: state.action.analyticsOrigin ?? GA4_PRODUCT_ORIGINS.MANUAL,
      });

      const completedAction = result.account
        ? {
            ...state.action,
            account: result.account,
            proposedAccount: null,
            accountResolution: {
              status: 'resolved',
              account: result.account,
              candidates: [result.account],
            },
            payload: { ...state.action.payload, account_id: result.account.id },
          }
        : state.action;
      const response = buildCompletionResponse(completedAction, responseOptions);
      dispatch({ type: 'COMPLETE', action: completedAction, result: result.data, response: response.text });
      return { result, response };
    })();

    confirmationPromiseRef.current = confirmationPromise;
    try {
      return await confirmationPromise;
    } finally {
      if (confirmationPromiseRef.current === confirmationPromise) {
        confirmationPromiseRef.current = null;
      }
    }
  }, [executeAtomicAction, provisioningCoordinator, responseOptions, saveAccount, saveTransaction, state.action]);

  const cancel = useCallback(() => {
    const response = buildCanceledResponse(responseOptions);
    dispatch({ type: 'CANCEL', response: response.text });
    // BUG REAL: sem isso, o contexto de inferência entre turnos
    // (contextRef, usado por parseFinancialText para herdar categoria/
    // descrição/conta/data de UM turno para o próximo -- ver
    // uni-intents/conversationContext.js) sobrevivia ao cancelamento e
    // podia vazar para uma frase financeira completamente nova e
    // independente digitada/falada depois.
    contextRef.current = createConversationContext();
    return response;
  }, [responseOptions]);

  const provideInput = useCallback((overrides, parsedOverride) => correct(overrides, parsedOverride), [correct]);

  const setAnalyticsOrigin = useCallback((origin) => {
    analyticsOriginRef.current = origin === GA4_PRODUCT_ORIGINS.VOICE
      ? GA4_PRODUCT_ORIGINS.VOICE
      : GA4_PRODUCT_ORIGINS.MANUAL;
  }, []);

  const restore = useCallback((snapshot) => {
    if (!snapshot?.action || !['ready', 'needs_clarification'].includes(snapshot.action.status)) {
      return false;
    }
    overridesRef.current = {
      clientOperationId: snapshot.action.clientOperationId,
      analyticsOrigin: snapshot.action.analyticsOrigin ?? GA4_PRODUCT_ORIGINS.MANUAL,
      amount: snapshot.action.amount,
      // Sem isto, um rascunho que já trocou de tipo ("é receita") voltaria ao
      // tipo da frase original ao retomar depois da criação da categoria.
      transactionType: ['income', 'expense'].includes(snapshot.action.transactionType)
        ? snapshot.action.transactionType
        : undefined,
      accountId: snapshot.action.account?.id ?? snapshot.action.payload?.account_id,
      accountRecord: snapshot.action.account ?? null,
      destinationAccountId: snapshot.action.payload?.destination_account_id,
      categoryId: snapshot.action.category?.id ?? snapshot.action.payload?.category_id,
      description: snapshot.action.description,
      date: snapshot.action.date,
    };
    dispatch({
      type: 'RESTORE',
      parsed: snapshot.parsed,
      action: snapshot.action,
      response: snapshot.response,
      memory: snapshot.memory,
    });
    return true;
  }, []);

  const reset = useCallback(() => {
    overridesRef.current = {};
    // Mesmo motivo do cancel(): um reset (ex.: após confirmar com sucesso,
    // ou ao abandonar uma pendência antiga por uma frase nova) precisa
    // apagar o contexto de inferência entre turnos -- nunca deixar
    // categoria/descrição/conta/data de uma conversa já encerrada
    // influenciar a próxima interpretação.
    contextRef.current = createConversationContext();
    dispatch({ type: 'RESET' });
  }, []);

  return {
    state,
    interpret,
    correct,
    provideInput,
    confirm,
    cancel,
    restore,
    reset,
    setAnalyticsOrigin,
  };
}
