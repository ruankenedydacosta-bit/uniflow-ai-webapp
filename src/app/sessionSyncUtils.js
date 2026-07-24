// AUTH2 -- decisao pura sobre quando um evento de onAuthStateChange deve ser
// tratado como atualizacao SILENCIOSA (nunca ativa o loading global nem
// desmonta a arvore autenticada em App.jsx) versus um bootstrap completo real
// (login genuino, primeira sessao resolvida, logout). Extraida de
// SessionContext.jsx para ser testavel sem depender de renderizacao React.
//
// Causa raiz do bug AUTH2: o Supabase pode reemitir SIGNED_IN para a MESMA
// sessao ja autenticada (ex.: ao revalidar o token quando a aba volta a ficar
// visivel), e TOKEN_REFRESHED/USER_UPDATED nunca representam uma nova sessao.
// Tratar esses eventos como um novo login (isLoading=true) fazia App.jsx
// desmontar toda a UI autenticada repetidamente, interrompendo qualquer modal
// ou formulario aberto.
export function isSilentAuthEvent(event, nextSession, latestUserId) {
  if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
    return true;
  }

  if (event === 'SIGNED_IN') {
    return latestUserId !== null && nextSession?.user?.id === latestUserId;
  }

  return false;
}
