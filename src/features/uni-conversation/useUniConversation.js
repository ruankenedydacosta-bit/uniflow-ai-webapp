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
} = {}) {
  const [state, dispatch] = useReducer(
    uniConversationReducer,
    initialUniConversationState,
  );
  const contextRef = useRef(createConversationContext());
  const overridesRef = useRef({});
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
    (parsed, overrides = {}) => buildFinancialIntentAction({
      parsed,
      accounts,
      accountTypes,
      categories,
      referenceDate,
      overrides,
    }),
    [accountTypes, accounts, categories, referenceDate],
  );

  const interpret = useCallback((content) => {
    dispatch({ type: 'INTERPRET' });
    const clientOperationId = createClientOperationId();
    overridesRef.current = { clientOperationId };
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

  const correct = useCallback((overrides) => {
    if (!state.parsed) return null;
    overridesRef.current = { ...overridesRef.current, ...overrides };
    const action = buildAction(state.parsed, overridesRef.current);
    const response = action.status === 'ready'
      ? buildConfirmationResponse(action, responseOptions)
      : buildClarificationResponse(action, responseOptions);
    dispatch({
      type: action.status === 'ready' ? 'AWAIT_CONFIRMATION' : 'NEEDS_CLARIFICATION',
      parsed: state.parsed,
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
    return response;
  }, [responseOptions]);

  const reset = useCallback(() => {
    overridesRef.current = {};
    dispatch({ type: 'RESET' });
  }, []);

  return { state, interpret, correct, confirm, cancel, reset };
}
