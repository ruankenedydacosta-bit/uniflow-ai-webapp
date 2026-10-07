import { useEffect, useState } from 'react';
import { getIsPlatformAdmin } from '../../services/platformAdminService.js';

// 'loading' | 'granted' | 'denied'. Decide só o que aparece na tela: as
// funções admin_* do banco recusam quem não é admin de qualquer jeito.
export function useIsPlatformAdmin() {
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let isActive = true;
    // Mesmo deferimento via setTimeout(0) das telas de assinatura: evita
    // setState síncrono no corpo do efeito.
    const timeoutId = window.setTimeout(() => {
      getIsPlatformAdmin().then((result) => {
        if (!isActive) return;
        setStatus(result.data === true && !result.error ? 'granted' : 'denied');
      });
    }, 0);
    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  return status;
}
