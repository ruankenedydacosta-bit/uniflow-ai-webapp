import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { atualizarAssinatura, lerAssinatura, ouvirAssinaturas } from '../../services/assinaturaCache.js';

// Assinatura do workspace para as telas de Mais, Seu plano e Pagamento e
// assinatura. Devolve o valor guardado na hora e revalida ao montar.
// `carregando` só fica true quando ainda não há valor guardado: revisitar a
// tela não mostra "Carregando" de novo.
export function useAssinatura(workspaceId) {
  const estado = useSyncExternalStore(ouvirAssinaturas, () => lerAssinatura(workspaceId));

  useEffect(() => {
    atualizarAssinatura(workspaceId);
  }, [workspaceId]);

  const recarregar = useCallback(() => atualizarAssinatura(workspaceId), [workspaceId]);

  return {
    assinatura: estado.assinatura,
    carregando: Boolean(workspaceId) && !estado.temDado && (estado.carregando || !estado.erro),
    erro: estado.temDado ? null : estado.erro,
    recarregar,
  };
}
