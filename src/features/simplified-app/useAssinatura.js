import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  atualizarAssinatura,
  lerAssinatura,
  ouvirAssinaturas,
  resumirAssinatura,
} from '../../services/assinaturaCache.js';

// Assinatura do workspace para as telas de Mais, Seu plano e Pagamento e
// assinatura. Devolve o valor guardado na hora e revalida ao montar.
// `recarregar({ descartar: true })` serve para depois de cancelar ou trocar
// de plano: a tela não segue mostrando o plano antigo.
export function useAssinatura(workspaceId) {
  const estado = useSyncExternalStore(ouvirAssinaturas, () => lerAssinatura(workspaceId));

  useEffect(() => {
    atualizarAssinatura(workspaceId);
  }, [workspaceId]);

  const recarregar = useCallback((opcoes) => atualizarAssinatura(workspaceId, opcoes), [workspaceId]);

  return { ...resumirAssinatura(estado, workspaceId), recarregar };
}
