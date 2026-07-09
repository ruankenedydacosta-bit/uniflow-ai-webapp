import { useEffect } from 'react';

/**
 * useClickOutside — chama `onOutsideClick` quando um clique/toque ocorre
 * fora de `ref.current`. Extraído como compartilhado porque dropdowns,
 * menus, popovers e o futuro Modal (clique no backdrop) precisam do
 * mesmo comportamento.
 *
 * @param {import('react').RefObject<HTMLElement>} ref
 * @param {() => void} onOutsideClick
 * @param {boolean} [enabled=true] - permite desligar o listener sem
 *   desmontar o hook (ex.: só ativo quando o menu está aberto).
 */
export function useClickOutside(ref, onOutsideClick, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    function handlePointerDown(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        onOutsideClick(event);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [ref, onOutsideClick, enabled]);
}

/**
 * useEscapeKey — chama `onEscape` quando a tecla Escape é pressionada.
 * Mesma motivação de reuso do useClickOutside: fechar menus, popovers
 * e o futuro Modal sempre da mesma forma acessível.
 *
 * @param {() => void} onEscape
 * @param {boolean} [enabled=true]
 */
export function useEscapeKey(onEscape, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onEscape(event);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onEscape, enabled]);
}
