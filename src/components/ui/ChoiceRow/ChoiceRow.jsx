import { cx } from '../../../utils/cx.js';
import IconBox from '../IconBox/IconBox.jsx';
import styles from './ChoiceRow.module.css';

// Opção de seleção em linha (handoff 21 e 22): título, apoio opcional, ícone
// opcional à esquerda, um valor à direita (`trailing`) e o círculo de marcação.
// Com `name`, é um rádio de um grupo. Sem `name`, é um botão que age no toque
// (a escolha do lembrete é salva na hora, então setas do teclado não podem
// disparar a gravação).
function ChoiceRow({
  title,
  description,
  icon,
  iconTone,
  trailing,
  checked = false,
  disabled = false,
  name,
  value,
  onChange,
  onClick,
  className,
}) {
  const content = (
    <>
      {icon ? <IconBox size={32} tone={iconTone}>{icon}</IconBox> : null}
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        {description ? <span className={styles.description}>{description}</span> : null}
      </span>
      {trailing ? <span className={styles.trailing}>{trailing}</span> : null}
      <span className={styles.mark} aria-hidden="true" />
    </>
  );

  if (name) {
    return (
      <label className={cx(styles.row, className)} data-checked={checked} data-disabled={disabled}>
        <input
          type="radio"
          className={styles.input}
          name={name}
          value={value}
          checked={checked}
          disabled={disabled}
          onChange={onChange}
        />
        {content}
      </label>
    );
  }

  return (
    <button
      type="button"
      className={cx(styles.row, className)}
      data-checked={checked}
      data-disabled={disabled}
      aria-pressed={checked}
      disabled={disabled}
      onClick={onClick}
    >
      {content}
    </button>
  );
}

export default ChoiceRow;
