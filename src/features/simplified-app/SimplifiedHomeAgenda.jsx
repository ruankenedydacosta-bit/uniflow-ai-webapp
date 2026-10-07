import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import Timeline from '../../components/ui/Timeline/index.js';
import { useAgenda } from '../../hooks/useAgenda.js';
import { buildHomeAgendaRange, buildHomeTimeline } from './simplifiedHomeAgenda.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import styles from './simplifiedApp.module.css';

// Timeline do dia na Home (redesign, #89): os compromissos de hoje ou, sem
// nada hoje, os de amanhã. Só leitura; criar e editar continuam na Agenda.
function SimplifiedHomeAgenda() {
  const { workspace } = useSession();
  const workspaceId = workspace?.id;
  const now = useMemo(() => new Date(), []);
  const range = useMemo(() => buildHomeAgendaRange(now), [now]);
  const agenda = useAgenda({ workspaceId, startsFrom: range.startsFrom, startsTo: range.startsTo });
  const timeline = useMemo(() => buildHomeTimeline(agenda.items, now), [agenda.items, now]);

  // Erro de carregamento não vira aviso na Home: a Agenda já mostra o
  // problema com o botão de tentar de novo.
  if (agenda.error) return null;

  return (
    <section className={styles.homeSection} aria-labelledby="home-agenda-title">
      <div className={styles.homeSectionHead}>
        <h2 id="home-agenda-title">{timeline.title}</h2>
        <Link to={SIMPLIFIED_ROUTES.AGENDA}>Ver agenda</Link>
      </div>
      {timeline.items.length > 0 ? (
        <Timeline label={timeline.title} items={timeline.items} />
      ) : agenda.isLoading ? null : (
        <p className={styles.homeSectionEmpty}>Nenhum compromisso hoje.</p>
      )}
    </section>
  );
}

export default SimplifiedHomeAgenda;
