import { useCallback, useRef, useState } from 'react';

/**
 * useControllableState — resolve o padrão controlado/não-controlado do
 * React sem duplicar essa lógica em cada componente que precisa dela
 * (Sidebar.collapsed, Topbar menus, e futuramente Modal.open, Tooltip.open).
 *
 * Se `value` for fornecido (!== undefined), o componente é controlado:
 * o estado interno é ignorado e toda mudança passa por `onChange`, sem
 * nunca "vazar" um valor que o dono não decidiu. Se `value` for omitido,
 * o hook mantém estado interno normalmente, ainda chamando `onChange`
 * (útil para telemetria/side-effects) quando fornecido.
 *
 * @param {Object} options
 * @param {*} [options.value] - valor controlado (omitir para não-controlado)
 * @param {*} options.defaultValue - valor inicial quando não-controlado
 * @param {(next: *) => void} [options.onChange]
 * @returns {[*, (next: *|((prev:*)=>*)) => void]}
 *
 * @example
 * const [collapsed, setCollapsed] = useControllableState({
 *   value: props.collapsed,
 *   defaultValue: false,
 *   onChange: props.onCollapsedChange,
 * });
 */
export function useControllableState({ value, defaultValue, onChange } = {}) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const currentValue = isControlled ? value : internalValue;

  // Guarda a versão mais recente do valor atual para resolver updaters
  // funcionais (prev => next) mesmo em modo controlado, sem depender de
  // closures desatualizadas.
  const currentRef = useRef(currentValue);
  currentRef.current = currentValue;

  const setValue = useCallback(
    (next) => {
      const resolved = typeof next === 'function' ? next(currentRef.current) : next;

      if (!isControlled) {
        setInternalValue(resolved);
      }
      onChange?.(resolved);
    },
    [isControlled, onChange]
  );

  return [currentValue, setValue];
}
