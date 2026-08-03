import { forwardRef, useId } from 'react';
import styles from './Input.module.css';
import { useControllableState } from './hooks';
import { INPUT_TYPES } from './constants';

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

/**
 * Input — campo de texto base da UniFlow AI.
 *
 * Suporta os tipos nativos de <input> (text, password, email, number,
 * search, tel, url, date, time) e um modo `multiline` que renderiza um
 * <textarea> reaproveitando exatamente o mesmo wrapper/label/estados —
 * ver "Textarea" no README para a justificativa de não criar um
 * componente Textarea separado.
 *
 * @see README.md
 */
const Input = forwardRef(function Input(
  {
    type = 'text',
    size = 'md',
    label,
    helperText,
    error,
    success,
    warning,
    leftIcon = null,
    rightIcon = null,
    placeholder,
    required = false,
    disabled = false,
    readOnly = false,
    loading = false,
    clearable = false,
    fullWidth = false,
    multiline = false,
    rows = 3,
    id,
    value,
    defaultValue,
    onChange,
    onClear,
    className,
    style,
    ...rest
  },
  ref
) {
  if (process.env.NODE_ENV !== 'production' && !multiline && !INPUT_TYPES.includes(type)) {
     
    console.warn(`[Input] type="${type}" não é um dos tipos suportados: ${INPUT_TYPES.join(', ')}`);
  }

  const generatedId = useId();
  const inputId = id || generatedId;
  const helperId = `${inputId}-helper`;

  const [currentValue, setValue] = useControllableState(value, defaultValue ?? '', onChange);
  const hasValue = String(currentValue ?? '').length > 0;

  const validationState = error ? 'error' : warning ? 'warning' : success ? 'success' : null;
  const message = error || warning || success || helperText;

  const showClear = clearable && hasValue && !disabled && !readOnly && !loading;

  function handleChange(event) {
    setValue(event.target.value);
  }

  function handleClear() {
    setValue('');
    onClear?.();
  }

  const wrapperClassName = cx(
    styles.wrapper,
    styles[`size-${size}`],
    disabled && styles.disabled,
    readOnly && styles.readOnly,
    loading && styles.loading,
    validationState && styles[`state-${validationState}`]
  );

  const Field = multiline ? 'textarea' : 'input';

  return (
    <div className={cx(styles.root, fullWidth && styles.fullWidth, className)} style={style}>
      {label ? (
        <label htmlFor={inputId} className={styles.label}>
          {label}
          {required ? (
            <span className={styles.requiredMark} aria-hidden="true">
              {' '}
              *
            </span>
          ) : null}
        </label>
      ) : null}

      <div className={wrapperClassName}>
        {leftIcon ? (
          <span className={styles.icon} aria-hidden="true">
            {leftIcon}
          </span>
        ) : null}

        <Field
          ref={ref}
          id={inputId}
          type={multiline ? undefined : type}
          rows={multiline ? rows : undefined}
          className={styles.field}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          readOnly={readOnly}
          value={currentValue}
          onChange={handleChange}
          aria-invalid={validationState === 'error' || undefined}
          aria-required={required || undefined}
          aria-describedby={message ? helperId : undefined}
          aria-busy={loading || undefined}
          {...rest}
        />

        {loading ? (
          <span className={styles.spinner} aria-hidden="true">
            <span className={styles.spinnerBar} />
          </span>
        ) : showClear ? (
          <button
            type="button"
            className={styles.clearButton}
            onClick={handleClear}
            aria-label="Limpar campo"
          >
            <ClearGlyph />
          </button>
        ) : rightIcon ? (
          <span className={styles.icon} aria-hidden="true">
            {rightIcon}
          </span>
        ) : null}
      </div>

      {message ? (
        <p
          id={helperId}
          className={cx(styles.message, validationState && styles[`message-${validationState}`])}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
});

Input.displayName = 'Input';

/**
 * Glyph mínimo de "limpar" em SVG outline (mesma linguagem visual dos
 * ícones do produto — outline, peso único). Evita depender de um pacote
 * de ícones externo só para este botão interno.
 */
function ClearGlyph() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M5 5L15 15M15 5L5 15"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default Input;
