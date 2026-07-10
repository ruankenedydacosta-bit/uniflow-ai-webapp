import { useAccess } from '../app/AccessContext';
import { WORKSPACE_TYPES } from '../app/access.js';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { cx } from '../utils/cx';
import { formatCurrency } from '../utils/formatters';
import { projectsMock } from './projetos/projects.mock.js';
import styles from './ProjectsPage.module.css';

function ProjectsPage() {
  const { access } = useAccess();
  const isBusinessWorkspace = access.currentWorkspace === WORKSPACE_TYPES.BUSINESS;
  const projects = projectsMock.business;

  if (!isBusinessWorkspace) {
    return (
      <div className={styles.page}>
        <section className={styles.hero} aria-labelledby="projetos-title">
          <div className={styles.heroCopy}>
            <Badge variant="outline" dot>
              Empresarial
            </Badge>
            <h2 id="projetos-title">Projetos</h2>
            <p>Projetos está disponível no espaço empresarial.</p>
          </div>
        </section>

        <Card variant="outline" padding="lg" className={styles.lockedCard}>
          <h3>Troque para o espaço empresarial</h3>
          <p>Este módulo conecta clientes, entregas, prazos, marcos e impacto financeiro sem misturar dados pessoais.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="projetos-title">
        <div className={styles.heroCopy}>
          <Badge variant="secondary" dot>
            {projects.workspaceLabel}
          </Badge>
          <h2 id="projetos-title">Projetos</h2>
          <p>{projects.subtitle}</p>
        </div>

        <div className={styles.actions}>
          <Button>Novo projeto</Button>
          <Button variant="secondary">Perguntar à Uni</Button>
        </div>
      </section>

      <section className={styles.focusGrid} aria-label="Projetos que merecem atenção">
        <Card variant="glass" padding="lg" className={styles.attentionCard}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.eyebrow}>Entregas empresariais</span>
              <h3>Projetos que merecem atenção</h3>
            </div>
            <Badge variant="warning" size="sm" dot>
              Hoje
            </Badge>
          </div>
          <p className={styles.attentionText}>{projects.attention}</p>
        </Card>

        <Card variant="outline" padding="lg" className={styles.nextCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Próxima ação recomendada</h3>
              <p>O movimento mais útil para proteger entrega e caixa.</p>
            </div>
          </div>
          <strong>{projects.recommendedAction}</strong>
        </Card>
      </section>

      <section className={styles.projectsSection} aria-labelledby="projetos-list-title">
        <div className={styles.sectionHeader}>
          <div>
            <h3 id="projetos-list-title">Projetos em rota</h3>
            <p>Entregas conectadas a clientes, marcos e impacto financeiro.</p>
          </div>
        </div>

        <div className={styles.projectGrid}>
          {projects.projects.map((project) => (
            <Card key={project.name} variant="default" padding="md" className={styles.projectCard}>
              <div className={styles.projectTop}>
                <div>
                  <strong>{project.name}</strong>
                  <span>{project.client}</span>
                </div>
                <Badge variant={project.variant} size="sm">
                  {project.status}
                </Badge>
              </div>

              <div className={styles.progressBlock} aria-label={`Progresso de ${project.progress}% em ${project.name}`}>
                <div className={styles.progressMeta}>
                  <span>Progresso</span>
                  <strong>{project.progress}%</strong>
                </div>
                <div className={styles.progressTrack} aria-hidden="true">
                  <span style={{ width: `${project.progress}%` }} />
                </div>
              </div>

              <div className={styles.projectMeta}>
                <div>
                  <span>Prazo</span>
                  <strong>{project.deadline}</strong>
                </div>
                <div>
                  <span>Impacto</span>
                  <strong>{formatCurrency(project.financialImpact)}</strong>
                </div>
              </div>

              <div className={styles.projectFooter}>
                <p>{project.nextMilestone}</p>
                <Badge variant="glass" size="sm">
                  {project.priority}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className={styles.guidanceGrid} aria-label="Próximos marcos e leitura da Uni">
        <Card variant="glass" padding="lg" className={styles.milestonesCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Próximos marcos</h3>
              <p>Uma fila curta para decidir o que precisa acontecer antes do próximo compromisso.</p>
            </div>
          </div>

          <div className={styles.milestoneList}>
            {projects.milestones.map((milestone, index) => (
              <div key={milestone} className={styles.milestoneItem}>
                <span className={cx(styles.milestoneDot, styles[`milestoneTone${index + 1}`])} aria-hidden="true" />
                <p>{milestone}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card variant="outline" padding="lg" className={styles.uniCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Leitura da Uni</h3>
              <p>O que entregas, clientes e impacto financeiro indicam.</p>
            </div>
            <Badge variant="glass" size="sm" dot>
              Uni
            </Badge>
          </div>
          <p>{projects.uniReading}</p>
        </Card>
      </section>
    </div>
  );
}

export default ProjectsPage;
