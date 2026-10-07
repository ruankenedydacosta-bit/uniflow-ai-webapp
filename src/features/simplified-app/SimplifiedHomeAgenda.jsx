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

  // A seção fica sempre, com "Ver agenda": carregando mostra um esqueleto
  // curto e, em erro, a Agenda é onde se tenta de novo.
  let body;
  if (agenda.isLoading && timeline.items.length === 0) {
    body = (
      <div className={styles.homeSectionSkeleton} role="status" aria-label="Carregando compromissos">
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </div>
    );
  } else if (agenda.error) {
    body = <p className={styles.homeSectionEmpty}>Não foi possível carregar a agenda.</p>;
  } else if (timeline.items.length > 0) {
    body = <Timeline label={timeline.title} items={timeline.items} />;
  } else {
    body = <p className={styles.homeSectionEmpty}>Nenhum compromisso hoje.</p>;
  }

  return (
    <section className={styles.homeSection} aria-labelledby="home-agenda-title">
      <div className={styles.homeSectionHead}>
        <h2 id="home-agenda-title">{timeline.title}</h2>
        <Link to={SIMPLIFIED_ROUTES.AGENDA}>Ver agenda</Link>
      </div>
      {body}
    </section>
  );
}

export default SimplifiedHomeAgenda;
