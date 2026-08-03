import { uniOS } from '../../orchestrator/index.js';
import { UNI_OS_ENABLED } from '../featureFlags.js';
import {
  normalizeContextChannel,
  normalizeContextLanguage,
  normalizeContextRole,
  normalizeContextTimezone,
  normalizeFeatureFlags,
  normalizePersonalityMode,
  normalizeSessionState,
} from './contextNormalizer.js';
import { createUniOSContext } from './contextSchema.js';

function resolveSessionState(sessionContext = {}) {
  if (sessionContext.isLoading) return 'loading';
  if (sessionContext.error) return 'error';
  return sessionContext.isAuthenticated ? 'authenticated' : 'anonymous';
}

export function adaptContextSources(sources = {}, options = {}) {
  const source = sources && typeof sources === 'object' ? sources : {};
  const sessionContext = source.sessionContext ?? {};
  const profile = source.profile ?? sessionContext.profile ?? {};
  const workspace = source.workspace ?? sessionContext.workspace ?? {};
  const user = source.user ?? sessionContext.user ?? {};
  const authenticated = sessionContext.isAuthenticated === true;
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();

  return createUniOSContext({
    timestamp: now(),
    session: {
      authenticated,
      sessionId: source.sessionId ?? sessionContext.session?.id ?? null,
      state: normalizeSessionState(source.sessionState ?? resolveSessionState(sessionContext), authenticated),
    },
    user: {
      id: user.id ?? profile.id ?? null,
      profileCompleted: source.profileCompleted ?? profile.onboarding_completed,
    },
    workspace: {
      id: workspace.id ?? null,
      role: normalizeContextRole(source.workspaceRole ?? workspace.role),
    },
    conversation: {
      channel: normalizeContextChannel(source.channel),
      language: normalizeContextLanguage(source.language),
      timezone: normalizeContextTimezone(source.timezone),
    },
    personality: {
      mode: normalizePersonalityMode(source.personalityMode),
    },
    featureFlags: normalizeFeatureFlags(source.featureFlags),
  });
}

export function logContextSummary(logger, context) {
  logger.info?.('[UNI OS] Context', { timestamp: context.timestamp, version: context.metadata.version });
  logger.info?.('[UNI OS] Session', {
    authenticated: context.session.authenticated,
    state: context.session.state,
    hasSessionId: Boolean(context.session.sessionId),
  });
  logger.info?.('[UNI OS] Workspace', {
    present: Boolean(context.workspace.id),
    role: context.workspace.role,
  });
  logger.info?.('[UNI OS] Language', {
    language: context.conversation.language,
    timezone: context.conversation.timezone,
  });
  logger.info?.('[UNI OS] Channel', { channel: context.conversation.channel });
  logger.info?.('[UNI OS] Feature Flags', context.featureFlags);
}

export async function runContextAdapterShadow(sources, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', context: null, result: null });

  try {
    const context = adaptContextSources({
      ...sources,
      featureFlags: { ...sources?.featureFlags, uniOS: true },
    }, options.adapterOptions);
    const processor = options.processor ?? ((input) => uniOS.process(input));
    await processor({ parsedIntent: options.parsedIntent ?? {}, context });
    if (options.isDevelopment === true) logContextSummary(options.logger ?? console, context);
    return Object.freeze({ status: 'OBSERVED', context, result: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Context shadow validation failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', context: null, result: null });
  }
}
