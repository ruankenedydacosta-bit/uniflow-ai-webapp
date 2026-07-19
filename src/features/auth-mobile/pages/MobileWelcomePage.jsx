import { useNavigate } from 'react-router-dom';
import WelcomeCarousel from '../components/WelcomeCarousel.jsx';
import styles from '../authMobile.module.css';

function MobileWelcomePage() {
  const navigate = useNavigate();
  return (
    <main className={styles.welcomePage}>
      <header className={styles.mobileBrand} aria-label="UniFlow AI">
        <span className={styles.brandMark} aria-hidden="true">U</span>
        <span>UniFlow AI</span>
      </header>
      <WelcomeCarousel
        onCreateAccount={() => navigate('/login?mode=signup')}
        onSignIn={() => navigate('/login')}
      />
    </main>
  );
}

export default MobileWelcomePage;
