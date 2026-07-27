import Button from '../../../components/ui/Button';
import styles from '../authMobile.module.css';

function SocialAuthButtons({ onGoogleAuth, disabled = false, googleLoading = false }) {
  return (
    <div className={styles.socialActions} aria-label="Outras formas de acesso">
      <Button
        type="button"
        variant="outline"
        size="lg"
        fullWidth
        disabled={disabled}
        loading={googleLoading}
        leftIcon={<span className={styles.socialMark}>G</span>}
        onClick={onGoogleAuth}
      >
        Continuar com Google
      </Button>
    </div>
  );
}

export default SocialAuthButtons;
