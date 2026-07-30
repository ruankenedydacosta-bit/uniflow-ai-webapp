import styles from './simplifiedApp.module.css';

function SimplifiedPlaceholderPage({ title, description }) {
  return (
    <section className={styles.placeholderPage} aria-labelledby="simplified-placeholder-title">
      <span className={styles.placeholderEyebrow}>UniFlow AI</span>
      <h1 id="simplified-placeholder-title">{title}</h1>
      <p>{description}</p>
    </section>
  );
}

export default SimplifiedPlaceholderPage;

