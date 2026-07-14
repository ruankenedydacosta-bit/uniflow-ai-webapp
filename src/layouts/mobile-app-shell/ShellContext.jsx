import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { MOBILE_SHELL_CONFIG } from './shellConfig.js';

/* eslint-disable react-refresh/only-export-components -- o modulo publica Provider e hook como contrato unico do shell. */

const ShellContext = createContext(null);

export function ShellProvider({ children, initialTitle = MOBILE_SHELL_CONFIG.defaultTitle }) {
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle);

  const openMoreMenu = useCallback(() => setIsMoreMenuOpen(true), []);
  const closeMoreMenu = useCallback(() => setIsMoreMenuOpen(false), []);
  const toggleMoreMenu = useCallback(() => setIsMoreMenuOpen((current) => !current), []);

  const value = useMemo(() => ({
    title,
    setTitle,
    isMoreMenuOpen,
    openMoreMenu,
    closeMoreMenu,
    toggleMoreMenu,
  }), [closeMoreMenu, isMoreMenuOpen, openMoreMenu, title, toggleMoreMenu]);

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useMobileShell() {
  const context = useContext(ShellContext);
  if (!context) throw new Error('useMobileShell deve ser usado dentro de ShellProvider.');
  return context;
}
