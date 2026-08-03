import { useCallback, useEffect, useMemo, useState } from 'react';
import FinancialProfileContext from './FinancialProfileContext.js';
import {
  FINANCIAL_PROFILE_FADE_MS,
  isFinancialProfile,
  normalizeFinancialProfile,
} from './financialProfileConstants.js';
import { readFinancialProfile, writeFinancialProfile } from './financialProfileStorage.js';

const IDLE_PHASE = 'idle';

function FinancialProfileProvider({ children, initialProfile, storage }) {
  const [financialProfile, setActiveProfile] = useState(() =>
    normalizeFinancialProfile(initialProfile ?? readFinancialProfile(storage)),
  );
  const [selectedFinancialProfile, setSelectedProfile] = useState(financialProfile);
  const [transitionPhase, setTransitionPhase] = useState(IDLE_PHASE);
  const [transitionRequest, setTransitionRequest] = useState(0);

  useEffect(() => {
    if (transitionRequest === 0) return undefined;

    const swapTimer = setTimeout(() => {
      setActiveProfile(selectedFinancialProfile);
      setTransitionPhase('fade-in');
    }, FINANCIAL_PROFILE_FADE_MS);
    const settleTimer = setTimeout(() => {
      setTransitionPhase(IDLE_PHASE);
    }, FINANCIAL_PROFILE_FADE_MS * 2);

    return () => {
      clearTimeout(swapTimer);
      clearTimeout(settleTimer);
    };
  }, [selectedFinancialProfile, transitionRequest]);

  const setFinancialProfile = useCallback(
    (nextProfile) => {
      if (!isFinancialProfile(nextProfile)) return false;
      if (nextProfile === selectedFinancialProfile) return true;

      setSelectedProfile(nextProfile);
      writeFinancialProfile(nextProfile, storage);
      setTransitionPhase('fade-out');
      setTransitionRequest((request) => request + 1);

      return true;
    },
    [selectedFinancialProfile, storage],
  );

  const value = useMemo(
    () =>
      Object.freeze({
        financialProfile,
        selectedFinancialProfile,
        transitionPhase,
        isTransitioning: transitionPhase !== IDLE_PHASE,
        setFinancialProfile,
      }),
    [financialProfile, selectedFinancialProfile, setFinancialProfile, transitionPhase],
  );

  return (
    <FinancialProfileContext.Provider value={value}>
      {children}
    </FinancialProfileContext.Provider>
  );
}

export default FinancialProfileProvider;
