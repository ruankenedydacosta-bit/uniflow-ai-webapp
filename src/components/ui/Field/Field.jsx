import { cloneElement, isValidElement, useId } from 'react';
import { cx } from '../../../utils/cx.js';
import styles from './Field.module.css';

// Campo do redesign (handoff 21 e 22): rótulo de 12px, caixa de 44px no poço
// escuro com borda de card, violeta ao focar. `children` é o próprio input,
// textarea ou select. `icon` entra à esquerda e `trailing` à direita (caret
// dos seletores). A ajuda abaixo é ligada ao campo por aria-describedby.
function Field({ label, helper, icon, trailing, multiline = false, className, children }) {
  const helperId = useId();
  const control = helper && isValidElement(children)
    ? cloneElement(children, { 'aria-describedby': helperId })
    : children;

  return (
    <div className={cx(styles.field, className)}>
      <label className={styles.labelWrap}>
        <span className={styles.label}>{label}</span>
        <span className={cx(styles.box, multiline && styles.multiline)}>
          {icon ? <span className={styles.icon} aria-hidden="true">{icon}</span> : null}
          {control}
          {trailing ? <span className={styles.trailing} aria-hidden="true">{trailing}</span> : null}
        </span>
      </label>
      {helper ? <span id={helperId} className={styles.helper}>{helper}</span> : null}
    </div>
  );
}

export default Field;
