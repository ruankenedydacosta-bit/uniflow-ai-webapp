import { useSession } from '../../app/SessionContext.jsx';
import { getGoogleAuthFeedback } from './authMobileSchema.js';
import { getSafeAuthReturnPath, saveAuthReturnPath } from '../../app/authReturnPath.js';
import {
  clearPendingGa4GoogleAuth,
  persistPendingGa4GoogleAuth,
} from '../analytics/ga4AuthOperation.js';
import { GA4_PRODUCT_EVENT_NAMES } from '../analytics/ga4ProductContracts.js';

// AUTH4/ÚNICA FONTE REAL do login com Google -- LoginPage.jsx (aba
// "Continuar com Google" dentro de /login) e WelcomeDecisionPage.jsx (card
// "Já tenho conta", que agora chama o Google diretamente, sem passar por
// /login) chamam o MESMO hook, nunca duas implementações divergentes do
// mesmo fluxo OAuth. `signInWithGoogle()` (SessionContext) já redireciona o
// navegador inteiro para o Google via supabase.auth.signInWithOAuth -- esta
// função só prepara o retorno (returnTo) antes disso e traduz um eventual
// erro síncrono (ex.: Supabase não configurado) para uma mensagem exibível.
export function useGoogleAuthRedirect() {
  const { signInWithGoogle } = useSession();

  async function startGoogleAuth(rawFrom) {
    const returnTo = getSafeAuthReturnPath(rawFrom);
    saveAuthReturnPath(returnTo);
    persistPendingGa4GoogleAuth(GA4_PRODUCT_EVENT_NAMES.LOGIN);
    try {
      const result = await signInWithGoogle();
      const feedback = getGoogleAuthFeedback(result?.error);
      if (result?.error) clearPendingGa4GoogleAuth();
      // Sucesso real: o navegador já foi redirecionado para o Google pelo SDK
      // -- este retorno só é observável se, por algum motivo, o redirect não
      // chegou a ocorrer (ex.: Supabase não configurado).
      return { message: feedback ?? '', error: result?.error ?? null, returnTo };
    } catch (error) {
      clearPendingGa4GoogleAuth();
      throw error;
    }
  }

  return { startGoogleAuth };
}
