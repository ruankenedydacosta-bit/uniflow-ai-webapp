import Button from '../../../components/ui/Button';
import { PhGoogleLogoIcon } from '../../simplified-app/SimplifiedIcons.jsx';
import styles from '../authMobile.module.css';

// Fase 3 do redesign (#90): botão contornado com o logo do Google em 18px.
// O rótulo vem da tela ("Entrar com Google" ao entrar, "Continuar com
// Google" ao criar conta).
function SocialAuthButtons({
  onGoogleAuth, disabled = false, googleLoading = false, label = 'Entrar com Google',
}) {
  return (
    <div className={styles.socialActions} aria-label="Outras formas de acesso">
      <Button
        type="button"
        variant="outline"
        size="lg"
        fullWidth
        disabled={disabled}
        loading={googleLoading}
        leftIcon={<span className={styles.googleMark}><PhGoogleLogoIcon /></span>}
        onClick={onGoogleAuth}
      >
        {label}
      </Button>
    </div>
  );
}

export default SocialAuthButtons;
