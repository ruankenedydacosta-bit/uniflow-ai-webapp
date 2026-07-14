import { useEffect, useState } from 'react';

export const MOBILE_SHELL_MEDIA_QUERY = '(max-width: 767px)';

export function isMobileViewport(width) {
  return Number.isFinite(width) && width < 768;
}

function getInitialMatch() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(MOBILE_SHELL_MEDIA_QUERY).matches;
}

export function useMobileViewport() {
  const [isMobile, setIsMobile] = useState(getInitialMatch);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;

    const mediaQuery = window.matchMedia(MOBILE_SHELL_MEDIA_QUERY);
    const handleChange = (event) => setIsMobile(event.matches);

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isMobile;
}
