import { useState } from 'react';
import { normalizeHeaderInitials } from './mobileContextHeaderSchema.js';
import styles from './MobileContextHeader.module.css';

function HeaderAvatar({
  photoUrl,
  initials,
  isOnline = false,
  isLoading = false,
  workspaceType = 'personal',
  onPress,
}) {
  const [failedUrl, setFailedUrl] = useState(null);

  if (isLoading) {
    return <span className={`${styles.avatar} ${styles.avatarSkeleton}`} aria-hidden="true" />;
  }

  const showPhoto = Boolean(photoUrl && failedUrl !== photoUrl);

  return (
    <button
      type="button"
      className={`${styles.avatarButton} ${workspaceType === 'business' ? styles.avatarBusiness : styles.avatarPersonal}`}
      aria-label="Abrir perfil"
      onClick={() => onPress?.()}
    >
      <span className={styles.avatar}>
        {showPhoto ? (
          <img
            className={styles.avatarImage}
            src={photoUrl}
            alt=""
            onError={() => setFailedUrl(photoUrl)}
          />
        ) : (
          <span className={styles.avatarInitials} aria-hidden="true">{normalizeHeaderInitials(initials)}</span>
        )}
        {isOnline ? <span className={styles.avatarOnline} aria-label="Online" /> : null}
      </span>
    </button>
  );
}

export default HeaderAvatar;
