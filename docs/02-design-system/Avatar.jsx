import { forwardRef, useState, cloneElement } from 'react';
import styles from './Avatar.module.css';

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

function getInitials(name) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

/**
 * Avatar — representação visual de usuário/entidade da UniFlow AI.
 * Cascata de fallback: imagem → iniciais (a partir de `name`) → ícone genérico.
 *
 * `avatarRoot` (classe global, não módulo) é um hook estável usado por
 * Avatar.Group para aplicar borda de recorte e sobreposição sem acoplar
 * os dois módulos CSS entre si.
 *
 * @see README.md
 */
const Avatar = forwardRef(function Avatar(
  { src, alt = '', name, size = 'md', status, className, style, ...rest },
  ref
) {
  const [imageError, setImageError] = useState(false);
  const showImage = Boolean(src) && !imageError;
  const initials = getInitials(name);

  return (
    <span
      ref={ref}
      className={cx(styles.avatar, 'avatarRoot', styles[`size-${size}`], className)}
      style={style}
      role={showImage ? undefined : 'img'}
      aria-label={!showImage ? name || alt || 'Avatar' : undefined}
      {...rest}
    >
      {showImage ? (
        <img
          src={src}
          alt={alt || name || ''}
          className={styles.image}
          onError={() => setImageError(true)}
        />
      ) : initials ? (
        <span className={styles.initials} aria-hidden="true">
          {initials}
        </span>
      ) : (
        <FallbackGlyph />
      )}

      {status ? (
        <span className={cx(styles.status, styles[`status-${status}`])} aria-hidden="true" />
      ) : null}
    </span>
  );
});
Avatar.displayName = 'Avatar';

function FallbackGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={styles.fallbackIcon}>
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M4.5 19c1.6-3.2 4.6-5 7.5-5s5.9 1.8 7.5 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Avatar.Group — empilha Avatars com sobreposição e "borda de recorte",
 * truncando via `max` e exibindo um indicador "+N" para o restante.
 */
const AvatarGroup = forwardRef(function AvatarGroup(
  { children, max, size = 'md', className, style, ...rest },
  ref
) {
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
  const visible = max ? items.slice(0, max) : items;
  const overflowCount = max ? Math.max(items.length - max, 0) : 0;

  return (
    <div ref={ref} className={cx(styles.group, className)} style={style} {...rest}>
      {visible.map((child, index) => cloneElement(child, { key: child.key ?? index, size }))}

      {overflowCount > 0 ? (
        <span
          className={cx(styles.avatar, 'avatarRoot', styles[`size-${size}`], styles.overflow)}
          role="img"
          aria-label={`mais ${overflowCount}`}
        >
          <span className={styles.initials} aria-hidden="true">
            +{overflowCount}
          </span>
        </span>
      ) : null}
    </div>
  );
});
AvatarGroup.displayName = 'Avatar.Group';

Avatar.Group = AvatarGroup;

export default Avatar;
export { AvatarGroup };
