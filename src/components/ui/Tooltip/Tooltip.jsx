import { cloneElement, isValidElement, useId, useState } from 'react';
import { cx } from '../../../utils/cx';
import styles from './Tooltip.module.css';

function Tooltip({
  children,
  content,
  position = 'top',
  disabled = false,
  className,
  contentClassName,
}) {
  const tooltipId = useId();
  const [active, setActive] = useState(false);
  const shouldShow = active && !disabled && Boolean(content);

  function showTooltip() {
    if (!disabled && content) {
      setActive(true);
    }
  }

  function hideTooltip() {
    setActive(false);
  }

  const trigger = isValidElement(children)
    ? cloneElement(children, {
        'aria-describedby': shouldShow ? tooltipId : undefined,
      })
    : children;

  return (
    <span
      className={cx(styles.wrapper, className)}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {trigger}

      {shouldShow ? (
        <span
          id={tooltipId}
          role="tooltip"
          className={cx(styles.tooltip, styles[position], contentClassName)}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}

export default Tooltip;
