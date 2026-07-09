/**
 * cx — junta nomes de classe condicionalmente, ignorando valores falsy.
 *
 * Extraído do Button (primeiro componente da biblioteca) para
 * src/lib/cx.js no momento em que um segundo componente (Sidebar)
 * precisou da mesma lógica. Regra do Design System: nenhuma lógica
 * duplicada — a partir daqui, todo componente importa este helper em
 * vez de redeclará-lo localmente.
 *
 * Não introduz dependência nova (sem `clsx`/`classnames`): é a mesma
 * implementação mínima que já existia, apenas com um único dono.
 *
 * @param {...(string|false|null|undefined)} classes
 * @returns {string}
 *
 * @example
 * cx(styles.button, isActive && styles.active, className)
 */
export function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}
