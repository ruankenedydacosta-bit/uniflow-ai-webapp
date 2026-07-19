import Button from '../../../components/ui/Button';
import { SOCIAL_PROVIDERS } from '../authMobileSchema.js';
import styles from '../authMobile.module.css';

function SocialAuthButtons({ onGoogleAuth, onAppleAuth, disabled = false }) {
  return (
    <div className={styles.socialActions} aria-label="Outras formas de acesso">
      <Button
        variant="outline"
        size="lg"
        fullWidth
        disabled={disabled}
        leftIcon={<span className={styles.socialMark}>G</span>}
        onClick={() => onGoogleAuth(SOCIAL_PROVIDERS.GOOGLE)}
      >
        Continuar com Google
      </Button>
      <Button
        variant="outline"
        size="lg"
        fullWidth
        disabled={disabled}
        leftIcon={<span className={styles.socialMark}>A</span>}
        onClick={() => onAppleAuth(SOCIAL_PROVIDERS.APPLE)}
      >
        Continuar com Apple
      </Button>
    </div>
  );
}

export default SocialAuthButtons;
