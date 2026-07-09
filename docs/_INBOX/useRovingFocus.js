import { useCallback, useRef } from 'react';

/**
 * useRovingFocus — implementa o padrão "roving tabindex" (WAI-ARIA
 * Authoring Practices) para listas de navegação e menus: apenas um item
 * é focável via Tab por vez; ArrowUp/ArrowDown/Home/End movem o foco
 * dentro do grupo. Extraído como hook compartilhado porque tanto o
 * Sidebar (lista de navegação) quanto o menu do Topbar precisam do
 * mesmo comportamento — implementá-lo duas vezes violaria a regra de
 * não duplicar lógica.
 *
 * O hook não decide *o que* renderizar — só devolve um `onKeyDown` pronto
 * para o container da lista e um `getItemProps(index)` para cada item,
 * mantendo o componente consumidor livre para estilizar como quiser.
 *
 * @param {Object} options
 * @param {number} options.itemCount
 * @param {'vertical'|'horizontal'} [options.orientation='vertical']
 * @returns {{ onKeyDown: (e: KeyboardEvent) => void, getItemProps: (index:number) => object }}
 *
 * @example
 * const { onKeyDown, getItemProps } = useRovingFocus({ itemCount: items.length });
 * <ul onKeyDown={onKeyDown}>
 *   {items.map((item, i) => (
 *     <li key={item.id} {...getItemProps(i)}>...</li>
 *   ))}
 * </ul>
 */
export function useRovingFocus({ itemCount, orientation = 'vertical' }) {
  const itemRefs = useRef(new Map());
  const activeIndexRef = useRef(0);

  const registerItem = useCallback((index, node) => {
    if (node) {
      itemRefs.current.set(index, node);
    } else {
      itemRefs.current.delete(index);
    }
  }, []);

  const focusIndex = useCallback((index) => {
    const clamped = Math.max(0, Math.min(index, itemCount - 1));
    activeIndexRef.current = clamped;
    itemRefs.current.get(clamped)?.focus();
  }, [itemCount]);

  const onKeyDown = useCallback(
    (event) => {
      const nextKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
      const prevKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';

      if (event.key === nextKey) {
        event.preventDefault();
        focusIndex(activeIndexRef.current + 1);
      } else if (event.key === prevKey) {
        event.preventDefault();
        focusIndex(activeIndexRef.current - 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        focusIndex(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        focusIndex(itemCount - 1);
      }
    },
    [focusIndex, itemCount, orientation]
  );

  const getItemProps = useCallback(
    (index) => ({
      ref: (node) => registerItem(index, node),
      tabIndex: index === activeIndexRef.current ? 0 : -1,
      onFocus: () => {
        activeIndexRef.current = index;
      },
    }),
    [registerItem]
  );

  return { onKeyDown, getItemProps };
}
