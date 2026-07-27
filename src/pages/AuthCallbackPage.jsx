import { Navigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../app/SessionContext.jsx';
import { consumeAuthReturnPath, readAuthReturnPath } from '../app/authReturnPath.js';

/**
 * AUTH4 -- rota de retorno do login com Google. O cliente Supabase já
 * processa a sessão automaticamente a partir do código na URL (PKCE é o
 * flowType padrão do SDK, detectSessionInUrl também é padrão) e já remove
 * os parâmetros da URL sozinho depois de processar -- esta página não
 * manipula token nem query string manualmente.
 *
 * Reaproveita EXATAMENTE as mesmas regras de redirecionamento já usadas em
 * App.jsx (needsOnboarding), sem duplicar lógica nem criar um segundo
 * bootstrap de sessão: App.jsx já bloqueia a renderização de qualquer rota
 * (via o guard de isSessionLoading) enquanto a sessão está sendo
 * processada, então esta página só é alcançada depois que
 * synchronizeSession (AUTH2) já terminou -- sucesso ou falha.
 *
 * `<Navigate>` declarativo (nunca useEffect + navigate imperativo) evita
 * qualquer redirecionamento repetido: a cada render, o destino é derivado
 * puramente do estado da sessão, e assim que a URL muda este componente
 * desmonta e nunca mais roda.
 */
function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const { error: sessionError, needsOnboarding, session } = useSession();

  // O Supabase anexa estes parâmetros ao redirect quando o provedor recusa
  // o login (ex.: provider Google desabilitado no projeto) ou o usuário
  // cancela o consentimento -- nesses casos nunca existe sessão para
  // processar, então não há por que esperar isSessionLoading resolver.
  const oauthError = searchParams.get('error') || searchParams.get('error_description');
  const returnTo = readAuthReturnPath();

  if (oauthError || sessionError) {
    return <Navigate to="/login" replace state={{ oauthFailed: true, from: returnTo }} />;
  }

  if (!session) {
    // Só alcançável no modo demo (Supabase não configurado, guard de
    // isSessionLoading não bloqueia) -- sem sessão real para processar.
    return <Navigate to="/login" replace />;
  }

  const destination = consumeAuthReturnPath();
  return (
    <Navigate
      to={needsOnboarding ? '/onboarding' : destination}
      replace
      state={needsOnboarding ? { returnTo: destination } : undefined}
    />
  );
}

export default AuthCallbackPage;
