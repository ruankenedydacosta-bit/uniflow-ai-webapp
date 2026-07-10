import { useAccess } from '../app/AccessContext';
import { WORKSPACE_TYPES } from '../app/access.js';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { formatCurrency } from '../utils/formatters';
import { objectivesMock } from './objetivos/objectives.mock.js';
import styles from './ObjetivosPage.module.css';

function getObjectivesContext(currentWorkspace) {
  return currentWorkspace === WORKSPACE_TYPES.PERSONAL ? objectivesMock.personal : objectivesMock.business;
}

function getProgress(current, target) {
  if (!target) return 0;

  return Math.min(Math.round((current / target) * 100), 100);
}

function ObjetivosPage() {
  const { access } = useAccess();
  const objectives = getObjectivesContext(access.currentWorkspace);
  const focusProgress = getProgress(objectives.focus.current, objectives.focus.target);

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="objetivos-title">
        <div className={styles.heroCopy}>
          <Badge variant="secondary" dot>
            {objectives.workspaceLabel}
          </Badge>
          <h2 id="objetivos-title">Objetivos</h2>
          <p>{objectives.subtitle}</p>
        </div>

        <div className={styles.actions}>
          <Button>Criar objetivo</Button>
          <Button variant="secondary">Perguntar à Uni</Button>
        </div>
      </section>

      <section className={styles.focusGrid} aria-label="Destino em foco">
        <Card variant="glass" padding="lg" className={styles.focusCard}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.eyebrow}>Destino em foco</span>
              <h3>{objectives.focus.name}</h3>
            </div>
            <Badge variant={objectives.focus.statusVariant} size="sm" dot>
              {objectives.focus.status}
            </Badge>
          </div>

          <p className={styles.direction}>{objectives.focus.direction}</p>

          <div className={styles.progressBlock}>
            <div className={styles.progressMeta}>
              <strong>
                {formatCurrency(objectives.focus.current)} de {formatCurrency(objectives.focus.target)}
              </strong>
              <span>{focusProgress}%</span>
            </div>
            <div className={styles.progressTrack} aria-label={`${objectives.focus.name}: ${focusProgress}% concluído`}>
              <span style={{ width: `${focusProgress}%` }} />
            </div>
          </div>

          <div className={styles.routeGrid}>
            <div>
              <span>Quanto falta</span>
              <strong>{formatCurrency(objectives.focus.target - objectives.focus.current)}</strong>
            </div>
            <div>
              <span>Previsão</span>
              <strong>{objectives.focus.forecast}</strong>
            </div>
            <div>
              <span>Próximo passo</span>
              <strong>{objectives.focus.nextStep}</strong>
            </div>
          </div>
        </Card>

        <Card variant="outline" padding="lg" className={styles.uniCard}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.eyebrow}>Leitura da Uni</span>
              <h3>Rota atual</h3>
            </div>
            <Badge variant="glass" size="sm" dot>
              Uni
            </Badge>
          </div>
          <p>{objectives.uniReading}</p>
        </Card>
      </section>

      <section aria-labelledby="objetivos-list-title">
        <div className={styles.sectionHeader}>
          <div>
            <h3 id="objetivos-list-title">Rotas em andamento</h3>
            <p>Objetivos mockados para validar direção, previsão e próximo passo.</p>
          </div>
        </div>

        <div className={styles.objectivesGrid}>
          {objectives.objectives.map((objective) => {
            const progress = getProgress(objective.current, objective.target);

            return (
              <Card key={objective.name} variant="outline" padding="md" className={styles.objectiveCard}>
                <div className={styles.objectiveTop}>
                  <strong>{objective.name}</strong>
                  <Badge variant={objective.statusVariant} size="sm">
                    {objective.status}
                  </Badge>
                </div>

                <div className={styles.compactProgress}>
                  <div className={styles.progressTrack} aria-label={`${objective.name}: ${progress}% concluído`}>
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <span>{progress}%</span>
                </div>

                <div className={styles.objectiveMeta}>
                  <span>
                    {formatCurrency(objective.current)} de {formatCurrency(objective.target)}
                  </span>
                  <span>{objective.forecast}</span>
                </div>

                <p>{objective.nextStep}</p>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default ObjetivosPage;
