export const UNI_OS_STATES = Object.freeze({
  IDLE: 'idle',
  LISTENING: 'listening',
  THINKING: 'thinking',
  WAITING_CONFIRMATION: 'waiting_confirmation',
  EXECUTING: 'executing',
  FINISHED: 'finished',
  ERROR: 'error',
});

export const UNI_OS_STATE_EVENTS = Object.freeze({
  START_LISTENING: 'start_listening',
  START_THINKING: 'start_thinking',
  REQUEST_CONFIRMATION: 'request_confirmation',
  CONFIRM: 'confirm',
  COMPLETE: 'complete',
  FAIL: 'fail',
  RESET: 'reset',
});

const TRANSITIONS = Object.freeze({
  idle: Object.freeze({ start_listening: 'listening', start_thinking: 'thinking', fail: 'error' }),
  listening: Object.freeze({ start_thinking: 'thinking', fail: 'error', reset: 'idle' }),
  thinking: Object.freeze({ request_confirmation: 'waiting_confirmation', complete: 'finished', fail: 'error', reset: 'idle' }),
  waiting_confirmation: Object.freeze({ confirm: 'executing', fail: 'error', reset: 'idle' }),
  executing: Object.freeze({ complete: 'finished', fail: 'error' }),
  finished: Object.freeze({ reset: 'idle', start_thinking: 'thinking' }),
  error: Object.freeze({ reset: 'idle' }),
});

export function transitionUniOSState(currentState, event) {
  if (!Object.values(UNI_OS_STATES).includes(currentState)) {
    return { state: UNI_OS_STATES.ERROR, changed: true, error: 'invalid_state' };
  }
  if (event === UNI_OS_STATE_EVENTS.RESET) {
    return { state: UNI_OS_STATES.IDLE, changed: currentState !== UNI_OS_STATES.IDLE, error: null };
  }
  const nextState = TRANSITIONS[currentState]?.[event];
  if (!nextState) return { state: currentState, changed: false, error: 'invalid_transition' };
  return { state: nextState, changed: nextState !== currentState, error: null };
}
