import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { INITIAL_ONBOARDING_DATA } from './onboardingConstants';
import { validateStep } from './onboardingValidation';
import { loadOnboardingData, saveOnboardingProgress, completeOnboarding } from './onboardingService';

export function useOnboarding() {
  const { user, refreshSession, isDemoMode } = useSession();
  const [step, setStep] = useState(1);
  const [data, setData] = useState(INITIAL_ONBOARDING_DATA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [completed, setCompleted] = useState(false);
  const mountedRef = useRef(true);
  const completingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!user?.id) {
      const id = setTimeout(() => {
        if (mountedRef.current) setLoading(false);
      }, 0);
      return () => clearTimeout(id);
    }

    let cancelled = false;

    async function load() {
      const result = await loadOnboardingData(user.id);

      if (cancelled || !mountedRef.current) return;

      if (result.data) {
        const savedStep = result.data.step;
        const savedData = result.data.data;

        if (savedStep && savedStep >= 1 && savedStep <= 6) {
          setStep(savedStep);
        }
        if (savedData) {
          setData({ ...INITIAL_ONBOARDING_DATA, ...savedData });
        }
      }

      setLoading(false);
    }

    load();

    return () => { cancelled = true; };
  }, [user?.id]);

  const updateData = useCallback((partial) => {
    setData((prev) => ({ ...prev, ...partial }));
  }, []);

  const goToStep = useCallback((targetStep) => {
    if (targetStep >= 1 && targetStep <= 6) {
      setError(null);
      setStep(targetStep);
    }
  }, []);

  const goNext = useCallback(async () => {
    const validation = validateStep(step, data);
    if (!validation.isValid) {
      setError(validation.errors);
      return false;
    }

    const nextStep = step + 1;
    if (nextStep > 6) return false;

    setError(null);
    setStep(nextStep);

    if (user?.id) {
      saveOnboardingProgress(user.id, nextStep, data).catch(() => {});
    }

    return true;
  }, [step, data, user]);

  const goPrev = useCallback(() => {
    if (step <= 1) return;
    setError(null);
    const prevStep = step - 1;
    setStep(prevStep);

    if (user?.id) {
      saveOnboardingProgress(user.id, prevStep, data).catch(() => {});
    }
  }, [step, data, user]);

  const finish = useCallback(async () => {
    if (completingRef.current) return false;
    completingRef.current = true;

    setSaving(true);
    setError(null);

    try {
      const result = await completeOnboarding({
        user,
        userMode: data.mode,
        data,
      });

      if (!mountedRef.current) return false;

      if (result.error) {
        setError({ submit: result.error.message || 'Não foi possível concluir. Tente novamente.' });
        setSaving(false);
        completingRef.current = false;
        return false;
      }

      if (result.isDemoMode) {
        setCompleted(true);
        setSaving(false);
        completingRef.current = false;
        return true;
      }

      const refreshResult = await refreshSession();

      if (!mountedRef.current) return false;

      if (refreshResult.error) {
        setError({ submit: 'Sessão expirou. Entre novamente.' });
        setSaving(false);
        completingRef.current = false;
        return false;
      }

      setCompleted(true);
      setSaving(false);
      completingRef.current = false;
      return true;
    } catch {
      if (mountedRef.current) {
        setError({ submit: 'Erro inesperado. Tente novamente.' });
        setSaving(false);
      }
      completingRef.current = false;
      return false;
    }
  }, [user, data, refreshSession]);

  return {
    step,
    data,
    loading,
    saving,
    error,
    completed,
    isDemoMode,
    totalSteps: 6,
    updateData,
    goToStep,
    goNext,
    goPrev,
    finish,
  };
}
