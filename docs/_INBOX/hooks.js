import { useRef } from 'react';
import { useControllableState } from '../../../hooks/useControllableState';
import { useClickOutside, useEscapeKey } from '../../../hooks/useDismissable';

/**
 * useTopbarMenu — abre/fecha o menu de usuário do Topbar, fechando
 * automaticamente ao clicar fora ou pressionar Escape. Delega toda a
 * lógica de estado e dismissal aos hooks compartilhados (useControllableState,
 * useClickOutside, useEscapeKey) — nada é reimplementado aqui.
 */
export function useTopbarMenu() {
  const menuRef = useRef(null);
  const [isOpen, setIsOpen] = useControllableState({ defaultValue: false });

  useClickOutside(menuRef, () => setIsOpen(false), isOpen);
  useEscapeKey(() => setIsOpen(false), isOpen);

  function toggle() {
    setIsOpen((prev) => !prev);
  }

  function close() {
    setIsOpen(false);
  }

  return { menuRef, isOpen, toggle, close };
}
