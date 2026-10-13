import { useEffect } from 'react';
import { registrarUsoDoApp } from '../../services/appUsageService.js';

// O banco soma o intervalo entre duas chamadas de até 90 segundos
// (migration 068). Um minuto deixa folga para timer atrasado em aba lenta.
export const USO_DO_APP_INTERVALO_MS = 60_000;

// Avisa o banco que o app está aberto, para o relatório de uso do painel de
// administração. Só conta com a tela visível: em segundo plano o timer para,
// e a chamada ao esconder fecha o último minuto.
export function useRegistroDeUsoDoApp(isEnabled) {
  useEffect(() => {
    if (!isEnabled) return undefined;
    let intervalId = null;

    function registrar() {
      registrarUsoDoApp().catch(() => {});
    }

    function iniciar() {
      if (intervalId) return;
      registrar();
      intervalId = window.setInterval(registrar, USO_DO_APP_INTERVALO_MS);
    }

    function parar() {
      if (!intervalId) return;
      window.clearInterval(intervalId);
      intervalId = null;
      registrar();
    }

    function handleVisibility() {
      if (document.visibilityState === 'visible') iniciar();
      else parar();
    }

    if (document.visibilityState === 'visible') iniciar();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [isEnabled]);
}
