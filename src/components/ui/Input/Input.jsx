import { forwardRef, useId } from 'react';
import { cx } from '../../../utils/cx';
import styles from './Input.module.css';

const Input = forwardRef(function Input(
  {
    label,
    helperText,
    error,
    leftIcon,
    rightIcon,
    fullWidth = false,
    className,
    inputClassName,
    id,
    type = 'text',
    disabled = false,
    required = false,
    variant = 'default',
    size = 'md',
    ...props
  },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helperId = helperText ? `${inputId}-helper` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cx(styles.root, fullWidth && styles.fullWidth, className)}>
      {label ? (
        <label className={styles.label} htmlFor={inputId}>
          {label}
          {required ? (
            <span className={styles.required} aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}

      <div
        className={cx(
          styles.control,
          styles[variant],
          styles[size],
          error && styles.error,
          disabled && styles.disabled
        )}
      >
        {leftIcon ? (
          <span className={styles.icon} aria-hidden="true">
            {leftIcon}
          </span>
        ) : null}

        <input
          ref={ref}
          id={inputId}
          type={type}
          className={cx(styles.input, inputClassName)}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...props}
        />

        {rightIcon ? (
          <span className={styles.icon} aria-hidden="true">
            {rightIcon}
          </span>
        ) : null}
      </div>

      {error ? (
        <p id={errorId} className={cx(styles.message, styles.errorMessage)}>
          {error}
        </p>
      ) : helperText ? (
        <p id={helperId} className={styles.message}>
          {helperText}
        </p>
      ) : null}
    </div>
  );
});

export default Input;
