import { useLocation } from 'react-router-dom';
import { MobileAuthPage } from '../features/auth-mobile';
import { useGoogleAuthRedirect } from '../features/auth-mobile/useGoogleAuthRedirect.js';
import { getSafeAuthReturnPath } from '../app/authReturnPath.js';

/**
 * AUTH4: wrapper fino que injeta o login real com Google em MobileAuthPage
 * (que já aceita `onGoogleAuth` como prop desde a UX1, mas nunca recebia
 * nada -- LoginPage.jsx antes era só um re-export sem props).
 *
 * GOOGLE DIRETO NA TELA DE BOAS-VINDAS: handleGoogleAuth passou a usar o
 * hook useGoogleAuthRedirect (mesma implementação real usada pelo card
 * "Já tenho conta" em WelcomeDecisionPage.jsx) -- nunca duas
 * implementações divergentes do mesmo fluxo OAuth.
 */
function LoginPage() {
  const location = useLocation();
  const { startGoogleAuth } = useGoogleAuthRedirect();
  const returnTo = getSafeAuthReturnPath(location.state?.from);

  async function handleGoogleAuth() {
    const result = await startGoogleAuth(location.state?.from);
    // Sucesso: o navegador já foi redirecionado para o Google pelo SDK
    // (signInWithOAuth redireciona por padrão) -- este retorno só é
    // observável se, por algum motivo, o redirect não chegou a ocorrer.
    return { message: result.message };
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
