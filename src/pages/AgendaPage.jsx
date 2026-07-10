import { useAccess } from '../app/AccessContext';
import { WORKSPACE_TYPES } from '../app/access.js';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { cx } from '../utils/cx';
import { agendaMock } from './agenda/agenda.mock.js';
import styles from './AgendaPage.module.css';

function getAgendaContext(currentWorkspace) {
  return currentWorkspace === WORKSPACE_TYPES.PERSONAL ? agendaMock.personal : agendaMock.business;
}

function AgendaPage() {
  const { access } = useAccess();
  const agenda = getAgendaContext(access.currentWorkspace);

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="agenda-title">
        <div className={styles.heroCopy}>
          <Badge variant="secondary" dot>
            {agenda.workspaceLabel}
          </Badge>
          <h2 id="agenda-title">Agenda</h2>
          <p>{agenda.subtitle}</p>
        </div>

        <div className={styles.actions}>
          <Button>Novo lembrete</Button>
          <Button variant="secondary">Perguntar à Uni</Button>
        </div>
      </section>

      <section className={styles.focusGrid} aria-label="Agenda financeira do dia">
        <Card variant="glass" padding="lg" className={styles.todayCard}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.eyebrow}>Agenda financeira</span>
              <h3>{agenda.todayFocus.title}</h3>
            </div>
            <Badge variant={agenda.todayFocus.variant} size="sm" dot>
              {agenda.todayFocus.status}
            </Badge>
          </div>

          <p className={styles.todayText}>{agenda.todayFocus.description}</p>
        </Card>

        <Card variant="outline" padding="lg" className={styles.weekCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Próximos 7 dias</h3>
              <p>Uma visão curta do que merece atenção.</p>
            </div>
          </div>

          <div className={styles.weekLine} aria-label="Visão semanal simples">
            {agenda.week.map((day) => (
              <div key={day.label} className={styles.weekItem}>
                <span className={cx(styles.weekDot, styles[day.tone])} aria-hidden="true" />
                <strong>{day.label}</strong>
                <small>
                  {day.count} {day.count === 1 ? 'item' : 'itens'}
                </small>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className={styles.eventsSection} aria-labelledby="agenda-events-title">
        <div className={styles.sectionHeader}>
          <div>
            <h3 id="agenda-events-title">Próximos compromissos</h3>
            <p>Eventos mockados que a Uni acompanha para reduzir esforço mental.</p>
          </div>
        </div>

        <div className={styles.eventList}>
          {agenda.events.map((event) => (
            <Card key={event.title} variant="default" padding="md" className={styles.eventCard}>
              <div className={styles.eventTop}>
                <div>
                  <strong>{event.title}</strong>
                  <span>
                    {event.type} · {event.due}
                  </span>
                </div>
                <Badge variant={event.variant} size="sm">
                  {event.priority}
                </Badge>
              </div>

              <div className={styles.eventMeta}>
                <span>{event.status}</span>
                <p>{event.action}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className={styles.guidanceGrid} aria-label="Orientação da Uni para agenda">
        <Card variant="glass" padding="lg" className={styles.uniCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Leitura da Uni</h3>
              <p>O que a agenda indica agora.</p>
            </div>
            <Badge variant="glass" size="sm" dot>
              Uni
            </Badge>
          </div>
          <p>{agenda.uniReading}</p>
        </Card>

        <Card variant="outline" padding="lg" className={styles.nextCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Próxima ação recomendada</h3>
              <p>Um passo simples para manter a semana sob controle.</p>
            </div>
          </div>
          <strong>{agenda.nextAction}</strong>
        </Card>
      </section>
    </div>
  );
}

export default AgendaPage;
