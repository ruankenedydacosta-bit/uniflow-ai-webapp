import { forwardRef } from 'react';
import styles from './Loader.module.css';

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

const SPINNER_DOTS = 8;

/**
 * Loader — indicadores de carregamento da UniFlow AI.
 * Cinco variantes, todas construídas exclusivamente com as animações já
 * existentes em theme.css/animations.css (uf-fade-in, uf-scale-in,
 * uf-loading-wave) — nenhum @keyframes novo é criado.
 *
 * @see README.md
 */
const Loader = forwardRef(function Loader(
  {
    variant = 'spinner',
    size = 'md',
    label = 'Carregando',
    width,
    height,
    shape = 'text',
    className,
    style,
    ...rest
  },
  ref
) {
  return (
    <span
      ref={ref}
      role="status"
      aria-live="polite"
      className={cx(styles.root, className)}
      style={style}
      {...rest}
    >
      <span className={styles.srOnly}>{label}</span>

      {variant === 'spinner' && <Spinner size={size} />}
      {variant === 'dots' && <Dots size={size} />}
      {variant === 'pulse' && <Pulse size={size} />}
      {variant === 'linear' && <Linear size={size} />}
      {variant === 'skeleton' && <Skeleton width={width} height={height} shape={shape} />}
    </span>
  );
});
Loader.displayName = 'Loader';

function Spinner({ size }) {
  return (
    <span className={cx(styles.spinner, styles[`size-${size}`])} aria-hidden="true">
      {Array.from({ length: SPINNER_DOTS }).map((_, i) => (
        <span
          key={i}
          className={styles.spinnerDotWrap}
          style={{ transform: `rotate(${(360 / SPINNER_DOTS) * i}deg)` }}
        >
          <span
            className={styles.spinnerDot}
            style={{ animationDelay: `calc(var(--uf-duration-slower) / ${SPINNER_DOTS} * ${i})` }}
          />
        </span>
      ))}
    </span>
  );
}

function Dots({ size }) {
  return (
    <span className={cx(styles.dots, styles[`size-${size}`])} aria-hidden="true">
      <span className={cx(styles.dot, 'uf-stagger-1')} />
      <span className={cx(styles.dot, 'uf-stagger-2')} />
      <span className={cx(styles.dot, 'uf-stagger-3')} />
    </span>
  );
}

function Pulse({ size }) {
  return <span className={cx(styles.pulse, styles[`size-${size}`])} aria-hidden="true" />;
}

function Linear({ size }) {
  return (
    <span className={cx(styles.linear, styles[`size-${size}`])} aria-hidden="true">
      <span className={styles.linearBar} />
    </span>
  );
}

function Skeleton({ width, height, shape }) {
  const inlineStyle = {
    width: width ?? (shape === 'circle' ? 'var(--uf-space-40)' : '100%'),
    height: height ?? (shape === 'circle' ? 'var(--uf-space-40)' : 'var(--uf-space-16)'),
  };
  return (
    <span
      className={cx('uf-skeleton', styles.skeleton, shape === 'circle' && styles.skeletonCircle)}
      style={inlineStyle}
      aria-hidden="true"
    />
  );
}

export default Loader;
