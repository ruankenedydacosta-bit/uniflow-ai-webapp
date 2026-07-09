import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import styles from '../UniAIPage.module.css';

function UniInsightReport({ report, onNewQuestion, onAction }) {
  if (!report) return null;

  return (
    <article className={styles.insightReport} aria-live="polite">
      <header className={styles.reportHeader}>
        <div>
          <Badge variant="success">Orientação preparada</Badge>
          <h3>Sua situação hoje</h3>
        </div>
        <span>Uni · consultora financeira</span>
      </header>

      <p className={styles.reportSummary}>{report.summary}</p>

      <section className={styles.reportSection}>
        <span>O que a Uni identificou</span>
        <ul>
          {report.findings.map((finding) => (
            <li key={finding}>{finding}</li>
          ))}
        </ul>
      </section>

      <section className={styles.reportSection}>
        <span>Próximos passos recomendados</span>
        <ul>
          {report.nextSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      </section>

      <footer className={styles.reportActions}>
        <span>Deseja continuar?</span>
        <div>
          <Button variant="outline" size="sm" onClick={onNewQuestion}>
            Fazer nova pergunta
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onAction('Criar plano')}>
            Criar plano
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onAction('Ver projeção')}>
            Ver projeção
          </Button>
        </div>
      </footer>
    </article>
  );
}

export default UniInsightReport;
