import assert from 'node:assert/strict';
import test from 'node:test';
import { transitionUniOSState, UNI_OS_STATES, UNI_OS_STATE_EVENTS } from './index.js';

test('state percorre pensamento, confirmação, execução e conclusão', () => {
  const thinking = transitionUniOSState(UNI_OS_STATES.IDLE, UNI_OS_STATE_EVENTS.START_THINKING);
  const waiting = transitionUniOSState(thinking.state, UNI_OS_STATE_EVENTS.REQUEST_CONFIRMATION);
  const executing = transitionUniOSState(waiting.state, UNI_OS_STATE_EVENTS.CONFIRM);
  const finished = transitionUniOSState(executing.state, UNI_OS_STATE_EVENTS.COMPLETE);
  assert.deepEqual([thinking.state, waiting.state, executing.state, finished.state], [
    'thinking', 'waiting_confirmation', 'executing', 'finished',
  ]);
});

test('state rejeita transição inválida sem mudar o estado', () => {
  assert.deepEqual(transitionUniOSState('idle', 'confirm'), {
    state: 'idle', changed: false, error: 'invalid_transition',
  });
});

test('state inválido entra em error e reset retorna idle', () => {
  assert.equal(transitionUniOSState('unknown', 'complete').state, 'error');
  assert.equal(transitionUniOSState('error', 'reset').state, 'idle');
});
