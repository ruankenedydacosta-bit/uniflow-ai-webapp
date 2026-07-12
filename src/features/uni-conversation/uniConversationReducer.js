export const UNI_CONVERSATION_STATES = Object.freeze({
  IDLE: 'idle',
  INTERPRETING: 'interpreting',
  NEEDS_CLARIFICATION: 'needs_clarification',
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  EXECUTING: 'executing',
  COMPLETED: 'completed',
  ERROR: 'error',
  CANCELED: 'canceled',
});

export const initialUniConversationState = Object.freeze({
  status: UNI_CONVERSATION_STATES.IDLE,
  parsed: null,
  action: null,
  response: '',
  result: null,
  error: null,
  memory: null,
});

export function uniConversationReducer(state, event) {
  switch (event.type) {
    case 'INTERPRET':
      return {
        ...initialUniConversationState,
        status: UNI_CONVERSATION_STATES.INTERPRETING,
      };
    case 'NEEDS_CLARIFICATION':
      return {
        ...state,
        status: UNI_CONVERSATION_STATES.NEEDS_CLARIFICATION,
        parsed: event.parsed,
        action: event.action,
        response: event.response,
        memory: event.memory ?? null,
        error: null,
      };
    case 'AWAIT_CONFIRMATION':
      return {
        ...state,
        status: UNI_CONVERSATION_STATES.AWAITING_CONFIRMATION,
        parsed: event.parsed,
        action: event.action,
        response: event.response,
        memory: event.memory ?? null,
        error: null,
      };
    case 'EXECUTE':
      return {
        ...state,
        status: UNI_CONVERSATION_STATES.EXECUTING,
        error: null,
      };
    case 'COMPLETE':
      return {
        ...state,
        status: UNI_CONVERSATION_STATES.COMPLETED,
        action: event.action ?? state.action,
        response: event.response,
        result: event.result,
        error: null,
      };
    case 'FAIL':
      return {
        ...state,
        status: UNI_CONVERSATION_STATES.ERROR,
        response: event.response,
        error: event.error,
      };
    case 'CANCEL':
      return {
        ...state,
        status: UNI_CONVERSATION_STATES.CANCELED,
        response: event.response,
        result: null,
        error: null,
      };
    case 'RESET':
      return initialUniConversationState;
    default:
      return state;
  }
}
