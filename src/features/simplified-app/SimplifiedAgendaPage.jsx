import AgendaPage from '../../pages/AgendaPage.jsx';
import styles from './simplifiedApp.module.css';

function SimplifiedAgendaPage() {
  return (
    <div className={styles.agendaPage} data-simplified-agenda>
      <AgendaPage />
    </div>
  );
}

export default SimplifiedAgendaPage;
