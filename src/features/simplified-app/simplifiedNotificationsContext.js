import { createContext, useContext } from 'react';

// Fase 3 do redesign (#90): o SimplifiedAppShell chama useNotifications()
// uma única vez (para o sino) e publica o resultado aqui. A página de
// notificações e a linha do Mais leem o MESMO estado: marcar como lida na
// página atualiza o sino na hora, e nenhuma rota busca a lista duas vezes.
export const SimplifiedNotificationsContext = createContext(null);

export function useSimplifiedNotifications() {
  const value = useContext(SimplifiedNotificationsContext);
  if (!value) {
    throw new Error('useSimplifiedNotifications precisa estar dentro do SimplifiedAppShell.');
  }
  return value;
}
