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
 * Não decide apresentação/Plano Pessoal/onboarding aqui -- navega direto
 * para o destino salvo; os guards de App.jsx (apresentação -> Plano
 * Pessoal -> pagamento -> Home só com assinatura ativa) são reaplicados a
 * CADA navegação, inclusive na que esta página dispara, então nada
 * precisa ser duplicado aqui. App.jsx já bloqueia a renderização de
 * qualquer rota (via o guard de isSessionLoading) enquanto a sessão está
 * sendo processada, então esta página só é alcançada depois que
 * synchronizeSession (AUTH2) já terminou -- sucesso ou falha.
 *
 * `<Navigate>` declarativo (nunca useEffect + navigate imperativo) evita
 * qualquer redirecionamento repetido: a cada render, o destino é derivado
 * puramente do estado da sessão, e assim que a URL muda este componente
 * desmonta e nunca mais roda.
 *
 * GOOGLE DIRETO NA TELA DE BOAS-VINDAS: falha/cancelamento do OAuth (seletor
 * do Google fechado, erro de rede, erro do Supabase, conta inválida) volta
 * para /welcome -- não mais para /login -- porque agora é o card "Já tenho
 * conta" quem inicia o Google diretamente, sem passar por /login antes.
 * /welcome exibe a mensagem de erro e nunca fica presa em loading.
 */
function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const { error: sessionError, session } = useSession();

  // O Supabase anexa estes parâmetros ao redirect quando o provedor recusa
  // o login (ex.: provider Google desabilitado no projeto) ou o usuário
  // cancela o consentimento -- nesses casos nunca existe sessão para
  // processar, então não há por que esperar isSessionLoading resolver.
  const oauthError = searchParams.get('error') || searchParams.get('error_description');
  const returnTo = readAuthReturnPath();

  if (oauthError || sessionError) {
    return <Navigate to="/welcome" replace state={{ oauthFailed: true, from: returnTo }} />;
  }

  if (!session) {
    // Só alcançável no modo demo (Supabase não configurado, guard de
    // isSessionLoading não bloqueia) -- sem sessão real para processar.
    return <Navigate to="/welcome" replace />;
  }

  const destination = consumeAuthReturnPath();
  return <Navigate to={destination} replace />;
}

export default AuthCallbackPage;
