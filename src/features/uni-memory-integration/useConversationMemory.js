import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../../app/SessionContext.jsx';
import {
  createExplicitMemoryCandidate,
  listFinancialMemories,
} from '../../services/uniMemoryService.js';
import { applyExplicitMemories } from './explicitMemoryResolver.js';
import { createConversationMemoryContext } from './conversationMemoryContext.js';
import {
  buildMemorySuggestion,
  resolveMemorySuggestionChoice,
} from './memorySuggestionBuilder.js';

export const CONVERSATION_MEMORY_STATES = Object.freeze({
  IDLE: 'idle',
  LOADING: 'memory_loading',
  APPLIED: 'memory_applied',
  CONFLICT: 'memory_conflict',
  SUGGESTION: 'memory_suggestion',
  SAVING: 'memory_saving',
  SAVED: 'memory_saved',
  ERROR: 'memory_error',
});

const DEMO_USER_ID = 'demo-user';
const PERSONALITY_PROFILES = new Set(['balanced', 'direct', 'warm', 'strategic']);
const DEMO_MEMORIES = Object.freeze([
  {
    id: 'demo-memory-posto',
    user_id: DEMO_USER_ID,
    memory_type: 'merchant_category_mapping',
    memory_key: 'merchant:posto avenida',
    memory_value: {
      merchant: 'Posto Avenida',
      category_id: 'demo-transport',
      category_name: 'Transporte',
    },
    source: 'explicit_user',
    status: 'confirmed',
    user_confirmed: true,
  },
  {
    id: 'demo-memory-tone',
    user_id: DEMO_USER_ID,
    memory_type: 'conversation_preference',
    memory_key: 'conversation:tone',
    memory_value: { profile_id: 'balanced' },
    source: 'explicit_user',
    status: 'confirmed',
    user_confirmed: true,
  },
]);

function createDemoMemory(candidate) {
  return {
    id: `demo-memory-${Date.now()}`,
    user_id: DEMO_USER_ID,
    memory_type: candidate.type,
    memory_key: candidate.key,
    memory_value: candidate.value,
    source: candidate.source,
    status: 'candidate',
    user_confirmed: false,
  };
}

export function useConversationMemory() {
  const session = useSession();
  const { isDemoMode, user, workspace } = session;
  const [rawMemories, setRawMemories] = useState(
    isDemoMode ? [...DEMO_MEMORIES] : [],
  );
  const [status, setStatus] = useState(
    isDemoMode ? CONVERSATION_MEMORY_STATES.IDLE : CONVERSATION_MEMORY_STATES.LOADING,
  );
  const [error, setError] = useState(null);
  const [influence, setInfluence] = useState(null);
  const [pendingSuggestion, setPendingSuggestion] = useState(null);
  const savingRef = useRef(false);
  const sessionContext = useMemo(() => ({ workspace }), [workspace]);
  const currentUserId = isDemoMode ? DEMO_USER_ID : user?.id;
  const memoryContext = useMemo(
    () => createConversationMemoryContext(rawMemories, { currentUserId }),
    [currentUserId, rawMemories],
  );
  const preferredProfileId = useMemo(() => {
    const preference = memoryContext.memories.find(
      (memory) => memory.type === 'conversation_preference',
    );
    const profileId = preference?.value?.profile_id ?? preference?.value?.profileId;
    return PERSONALITY_PROFILES.has(profileId) ? profileId : null;
  }, [memoryContext]);

  useEffect(() => {
    let active = true;

    if (isDemoMode) {
      return () => { active = false; };
    }

    if (!workspace?.id || !user?.id) {
      return () => { active = false; };
    }

    listFinancialMemories(sessionContext, { limit: 100 }).then((result) => {
      if (!active) return;
      if (result.error) {
        setRawMemories([]);
        setError({
          code: result.error.code,
          message: 'Não consegui carregar suas preferências agora. A conversa continua normalmente.',
        });
        setStatus(CONVERSATION_MEMORY_STATES.ERROR);
        return;
      }
      setRawMemories(result.data ?? []);
      setError(null);
      setStatus(CONVERSATION_MEMORY_STATES.IDLE);
    });

    return () => { active = false; };
  }, [isDemoMode, sessionContext, user?.id, workspace?.id]);

  const resolveParsed = useCallback((parsedResult, options = {}) => {
    const result = applyExplicitMemories(parsedResult, memoryContext, options);
    setInfluence(result);
    if (result.conflicts.length) {
      setStatus(CONVERSATION_MEMORY_STATES.CONFLICT);
    } else if (result.influencedFields.length) {
      setStatus(CONVERSATION_MEMORY_STATES.APPLIED);
    } else if (status !== CONVERSATION_MEMORY_STATES.ERROR) {
      setStatus(CONVERSATION_MEMORY_STATES.IDLE);
    }
    return result;
  }, [memoryContext, status]);

  const suggestFromCorrection = useCallback((details) => {
    const suggestion = buildMemorySuggestion({
      ...details,
      memoryContext,
    });
    setPendingSuggestion(suggestion);
    if (suggestion) setStatus(CONVERSATION_MEMORY_STATES.SUGGESTION);
    return suggestion;
  }, [memoryContext]);

  const chooseSuggestion = useCallback(async (choice) => {
    const decision = resolveMemorySuggestionChoice(pendingSuggestion, choice);
    if (!decision.shouldPersist) {
      setPendingSuggestion(null);
      setStatus(influence?.influencedFields?.length
        ? CONVERSATION_MEMORY_STATES.APPLIED
        : CONVERSATION_MEMORY_STATES.IDLE);
      return { data: null, error: null, persisted: false, outcome: decision.outcome };
    }
    if (savingRef.current) {
      return {
        data: null,
        error: { code: 'MEMORY_SAVE_IN_PROGRESS', message: 'Essa preferência já está sendo salva.' },
        persisted: false,
      };
    }

    savingRef.current = true;
    setStatus(CONVERSATION_MEMORY_STATES.SAVING);
    try {
      if (isDemoMode) {
        const memory = createDemoMemory(decision.payload);
        setRawMemories((current) => [...current, memory]);
        setPendingSuggestion(null);
        setStatus(CONVERSATION_MEMORY_STATES.SAVED);
        return { data: memory, error: null, persisted: true, isDemoMode: true };
      }

      const result = await createExplicitMemoryCandidate(
        sessionContext,
        decision.payload,
        { userInitiated: true },
      );
      if (result.error) {
        setError({
          code: result.error.code,
          message: 'Não consegui salvar essa preferência agora. Sua correção atual foi preservada.',
        });
        setStatus(CONVERSATION_MEMORY_STATES.ERROR);
        return { ...result, persisted: false };
      }
      setRawMemories((current) => [...current, result.data]);
      setPendingSuggestion(null);
      setError(null);
      setStatus(CONVERSATION_MEMORY_STATES.SAVED);
      return { ...result, persisted: true };
    } finally {
      savingRef.current = false;
    }
  }, [influence, isDemoMode, pendingSuggestion, sessionContext]);

  const resetInteraction = useCallback(() => {
    setInfluence(null);
    setPendingSuggestion(null);
    setError(null);
    setStatus(CONVERSATION_MEMORY_STATES.IDLE);
  }, []);

  return {
    status,
    error,
    memoryContext,
    influence,
    pendingSuggestion,
    preferredProfileId,
    isDemoMode,
    resolveParsed,
    suggestFromCorrection,
    chooseSuggestion,
    resetInteraction,
  };
}
