import { createAttentionResult } from '../attention/index.js';
import { requestCognitiveProcessing } from '../cognitive/index.js';
import { createReadOnlyContext } from '../context/index.js';
import { resolveEmotionTone } from '../emotion/index.js';
import { UNI_OS_IDENTITY } from '../identity/index.js';
import { consumeMemoryProviders } from '../memory/index.js';
import { evaluatePermissions } from '../permissions/index.js';
import { createPlan } from '../planning/index.js';
import { reflectOnPlan } from '../reflection/index.js';
import { createStructuredResponse } from '../response/index.js';
import { evaluateSecurity } from '../security/index.js';
import { transitionUniOSState, UNI_OS_STATE_EVENTS, UNI_OS_STATES } from '../state/index.js';

const DEFAULT_ENGINES = Object.freeze({
  identity: () => UNI_OS_IDENTITY,
  state: () => transitionUniOSState(UNI_OS_STATES.IDLE, UNI_OS_STATE_EVENTS.START_THINKING),
  attention: createAttentionResult,
  context: createReadOnlyContext,
  memory: consumeMemoryProviders,
  planning: createPlan,
  reflection: reflectOnPlan,
  security: evaluateSecurity,
  permissions: evaluatePermissions,
  cognitive: requestCognitiveProcessing,
  emotion: resolveEmotionTone,
  response: createStructuredResponse,
});

export function createUniOSOrchestrator(overrides = {}) {
  const engines = { ...DEFAULT_ENGINES, ...overrides };

  return Object.freeze({
    async process(input = {}) {
      const source = input && typeof input === 'object' ? input : {};
      const parsedIntent = source.parsedIntent ?? {};
      const identity = await engines.identity();
      const state = await engines.state();
      const attention = await engines.attention(parsedIntent);
      const context = await engines.context(source.context);
      const memory = await engines.memory(source.memoryProviders, {
        parsedIntent,
        context,
      });
      const plan = await engines.planning({ attention, intent: parsedIntent, context, memory });
      const reflection = await engines.reflection(plan, source.reflectionSignals);
      const security = await engines.security({ checks: source.securityChecks });
      const permissions = await engines.permissions({
        requirements: source.permissionRequirements,
        grants: source.permissionGrants,
      });
      const cognitive = await engines.cognitive({
        identity,
        state,
        attention,
        context,
        memory,
        plan,
        reflection,
        security,
        permissions,
      });
      const emotion = await engines.emotion({ attention, context: source.emotionContext });

      return engines.response({
        facts: {
          parsedIntent,
          identity,
          state,
          attention,
          context,
          memory,
          reflection,
          security,
          permissions,
          cognitive,
        },
        plan,
        emotion,
        personality: { base: identity.basePersonality },
        output: {
          status: cognitive.status,
          text: null,
          voice: null,
          executesAction: false,
        },
      });
    },
  });
}

export const uniOS = createUniOSOrchestrator();
