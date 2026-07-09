import { useEffect, useState } from 'react';

const isBrowser = typeof window !== 'undefined';

/**
 * Lê um --uf-breakpoint-* diretamente do :root computado, em vez de
 * duplicar o número em JS. theme.css continua sendo a única fonte de
 * verdade — se a marca mudar um breakpoint, nenhum hook precisa mudar.
 */
function readBreakpointToken(tokenName, fallbackPx) {
  if (!isBrowser) return fallbackPx;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(tokenName)
    .trim();
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallbackPx : parsed;
}

/**
 * useBreakpoint — expõe qual "banda" da grade oficial (docx: Desktop 12
 * col · Tablet 8 col · Mobile 4 col) a viewport atual corresponde,
 * lendo os tokens de theme.css em vez de hardcodar os números em JS.
 *
 * Os fallbacks abaixo (480/768/1280) só entram em uso se o CSS ainda não
 * carregou (ou em ambiente sem DOM) — são os mesmos valores documentados
 * em theme.css §11, nunca um valor novo inventado.
 *
 * @returns {{ mobile: boolean, tablet: boolean, desktop: boolean, width: number }}
 *
 * @example
 * const { desktop } = useBreakpoint();
 * // MainLayout decide entre sidebar fixa (desktop) ou drawer (mobile/tablet)
 */
export function useBreakpoint() {
  const [width, setWidth] = useState(() => (isBrowser ? window.innerWidth : 1280));

  useEffect(() => {
    if (!isBrowser) return undefined;

    function handleResize() {
      setWidth(window.innerWidth);
    }

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const tabletBreakpoint = readBreakpointToken('--uf-breakpoint-tablet', 768);
  const desktopBreakpoint = readBreakpointToken('--uf-breakpoint-desktop', 1280);

  return {
    width,
    mobile: width < tabletBreakpoint,
    tablet: width >= tabletBreakpoint && width < desktopBreakpoint,
    desktop: width >= desktopBreakpoint,
  };
}
