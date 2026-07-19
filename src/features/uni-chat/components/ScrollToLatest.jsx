import styles from './ScrollToLatest.module.css';

export default function ScrollToLatest({ visible, onClick }) {
  if (!visible) return null;
  return (
    <button type="button" className={styles.btn} onClick={onClick}>
      <ArrowDown />
      Voltar para a conversa atual
    </button>
  );
}

function ArrowDown() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12l7 7 7-7" />
    </svg>
  );
}
