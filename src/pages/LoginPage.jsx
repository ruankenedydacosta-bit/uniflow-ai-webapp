import { useLocation } from 'react-router-dom';
import { useSession } from '../app/SessionContext.jsx';
import { MobileAuthPage } from '../features/auth-mobile';
import { getGoogleAuthFeedback } from '../features/auth-mobile/authMobileSchema.js';
import { getSafeAuthReturnPath, saveAuthReturnPath } from '../app/authReturnPath.js';

/**
 * AUTH4: wrapper fino que injeta o login real com Google em MobileAuthPage
 * (que já aceita `onGoogleAuth` como prop desde a UX1, mas nunca recebia
 * nada -- LoginPage.jsx antes era só um re-export sem props).
 */
function LoginPage() {
  const location = useLocation();
  const { signInWithGoogle } = useSession();
  const returnTo = getSafeAuthReturnPath(location.state?.from);

  async function handleGoogleAuth() {
    saveAuthReturnPath(returnTo);
    const result = await signInWithGoogle();
    const feedback = getGoogleAuthFeedback(result?.error);
    // Sucesso: o navegador já foi redirecionado para o Google pelo SDK
    // (signInWithOAuth redireciona por padrão) -- este retorno só é
    // observável se, por algum motivo, o redirect não chegou a ocorrer.
    return { message: feedback ?? '' };
  }

  return (
    <MobileAuthPage
      onGoogleAuth={handleGoogleAuth}
      returnTo={returnTo}
      initialFeedback={location.state?.oauthFailed
        ? 'Não foi possível concluir o acesso com Google. Tente novamente.'
        : ''}
    />
  );
}

export default LoginPage;
