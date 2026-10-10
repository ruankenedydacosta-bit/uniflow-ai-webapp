import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import { ensureAppFont } from '../simplified-app/appFont.js';
import PresentationCarousel from './PresentationCarousel.jsx';
import {
  PRESENTATION_DEMO_USER_ID,
  PRESENTATION_NEXT_ROUTE,
} from './presentationConfig.js';
import { markPresentationCompleted } from './presentationStorage.js';
import styles from './Presentation.module.css';

function PresentationPage() {
  const navigate = useNavigate();
  const { isSupabaseConfigured, session } = useSession();
  const userId = isSupabaseConfigured
    ? session?.user?.id
    : PRESENTATION_DEMO_USER_ID;

  // Tela 21: a apresentação usa a fonte do app (Inter), como o login.
  useEffect(() => {
    ensureAppFont(document);
  }, []);

  function handleComplete() {
    markPresentationCompleted(userId);
    navigate(PRESENTATION_NEXT_ROUTE, { replace: true });
  }

  return (
    <main className={styles.presentationPage}>
      <PresentationCarousel onComplete={handleComplete} />
    </main>
  );
}

export default PresentationPage;

