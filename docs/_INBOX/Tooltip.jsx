import {
  forwardRef,
  cloneElement,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  useEffect,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './Tooltip.module.css';
import { DEFAULT_SHOW_DELAY_MS, DEFAULT_HIDE_DELAY_MS, GAP_PX } from './constants';

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

/**
 * Tooltip — dica contextual sob demanda (hover/foco) da UniFlow AI.
 *
 * Aceita exatamente um elemento filho como gatilho (deve aceitar `ref`).
 * Renderiza via Portal em `document.body` para evitar recorte por
 * `overflow: hidden` de containers pais e garantir empilhamento correto
 * (`--uf-z-tooltip`).
 *
 * @see README.md
 */
const Tooltip = forwardRef(function Tooltip(
  {
    content,
    placement = 'top',
    delay = DEFAULT_SHOW_DELAY_MS,
    hideDelay = DEFAULT_HIDE_DELAY_MS,
    disabled = false,
    children,
    className,
    style,
  },
  forwardedRef
) {
  const tooltipId = useId();
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const showTimeout = useRef(null);
  const hideTimeout = useRef(null);

  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);

  const clearTimers = useCallback(() => {
    if (showTimeout.current) clearTimeout(showTimeout.current);
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
  }, []);

  const scheduleShow = useCallback(() => {
    if (disabled || !content) return;
    clearTimers();
    showTimeout.current = setTimeout(() => setOpen(true), delay);
  }, [disabled, content, delay, clearTimers]);

  const scheduleHide = useCallback(() => {
    clearTimers();
    hideTimeout.current = setTimeout(() => setOpen(false), hideDelay);
  }, [hideDelay, clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    let top = 0;
    let left = 0;

    switch (placement) {
      case 'bottom':
        top = triggerRect.bottom + GAP_PX;
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        break;
      case 'left':
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        left = triggerRect.left - tooltipRect.width - GAP_PX;
        break;
      case 'right':
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        left = triggerRect.right + GAP_PX;
        break;
      case 'top':
      default:
        top = triggerRect.top - tooltipRect.height - GAP_PX;
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        break;
    }

    setCoords({ top, left });
  }, [placement]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePosition();

    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  function setRefs(node) {
    triggerRef.current = node;
    const { ref } = children;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }

  const trigger = cloneElement(children, {
    ref: setRefs,
    'aria-describedby': open ? tooltipId : undefined,
    onMouseEnter: (event) => {
      children.props.onMouseEnter?.(event);
      scheduleShow();
    },
    onMouseLeave: (event) => {
      children.props.onMouseLeave?.(event);
      scheduleHide();
    },
    onFocus: (event) => {
      children.props.onFocus?.(event);
      scheduleShow();
    },
    onBlur: (event) => {
      children.props.onBlur?.(event);
      scheduleHide();
    },
  });

  return (
    <>
      {trigger}
      {open && content
        ? createPortal(
            <span
              ref={tooltipRef}
              id={tooltipId}
              role="tooltip"
              className={cx(
                styles.tooltip,
                styles[`placement-${placement}`],
                'uf-animate-scale-in',
                className
              )}
              style={{
                top: coords?.top ?? -9999,
                left: coords?.left ?? -9999,
                visibility: coords ? 'visible' : 'hidden',
                ...style,
              }}
            >
              {content}
              <span className={styles.arrow} aria-hidden="true" />
            </span>,
            document.body
          )
        : null}
    </>
  );
});

Tooltip.displayName = 'Tooltip';

export default Tooltip;
