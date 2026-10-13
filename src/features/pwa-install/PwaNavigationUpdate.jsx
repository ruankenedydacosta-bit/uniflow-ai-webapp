import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { getPwaUpdateManager } from './pwaUpdateStore.js';

// Troca de tela é um momento seguro para trocar de build: no desktop a aba
// quase nunca vai para segundo plano, e sem isto a build nova só chegava
// numa aba nova. A primeira montagem não conta como troca.
function PwaNavigationUpdate() {
  const { pathname } = useLocation();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    void getPwaUpdateManager().updateOnNavigation();
  }, [pathname]);

  return null;
}

export default PwaNavigationUpdate;
