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
  categories = [],
  saveTransaction,
  profileId = 'balanced',
  workspaceType = 'personal',
  cognitiveMap,
  referenceDate,
} = {}) {
  const [state, dispatch] = useReducer(
    uniConversationReducer,
    initialUniConversationState,
  );
  const contextRef = useRef(createConversationContext());
  const overridesRef = useRef({});
  const responseOptions = useMemo(
    () => ({ profileId, workspaceType, cognitiveMap }),
    [cognitiveMap, profileId, workspaceType],
  );

  const buildAction = useCallback(
    (parsed, overrides = {}) => buildFinancialIntentAction({
      parsed,
      accounts,
      categories,
      referenceDate,
      overrides,
    }),
    [accounts, categories, referenceDate],
  );

  const interpret = useCallback((content) => {
    dispatch({ type: 'INTERPRET' });
    overridesRef.current = {};
    const parsed = parseFinancialText(content, {
      context: contextRef.current,
      referenceDate,
    });
    contextRef.current = parsed.nextContext;
    const action = buildAction(parsed);

    if (action.status === 'unsupported') {
      dispatch({ type: 'RESET' });
      return { handled: false, parsed, action };
    }

    if (action.status === 'needs_clarification') {
      const response = buildClarificationResponse(action, responseOptions);
      dispatch({ type: 'NEEDS_CLARIFICATION', parsed, action, response: response.text });
      return { handled: true, parsed, action, response };
    }

    const response = buildConfirmationResponse(action, responseOptions);
    dispatch({ type: 'AWAIT_CONFIRMATION', parsed, action, response: response.text });
    return { handled: true, parsed, action, response };
  }, [buildAction, referenceDate, responseOptions]);

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
    });
    return { action, response };
  }, [buildAction, responseOptions, state.parsed]);

  const confirm = useCallback(async () => {
    if (state.action?.status !== 'ready') return null;
    dispatch({ type: 'EXECUTE' });
    const result = await executeFinancialIntentAction(state.action, saveTransaction);

    if (result?.error || !result?.data) {
      const error = result?.error ?? { message: 'O lançamento não retornou confirmação.' };
      const response = buildExecutionErrorResponse(error, responseOptions);
      dispatch({ type: 'FAIL', error, response: response.text });
      return { result, response };
    }

    const response = buildCompletionResponse(state.action, responseOptions);
    dispatch({ type: 'COMPLETE', result: result.data, response: response.text });
    return { result, response };
  }, [responseOptions, saveTransaction, state.action]);

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
