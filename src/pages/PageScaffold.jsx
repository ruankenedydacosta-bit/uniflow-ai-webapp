import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import styles from './PageScaffold.module.css';

function PageScaffold({ title, description, badge = 'Módulo em construção', cards = [] }) {
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby={`${title}-title`}>
        <div className={styles.copy}>
          <Badge variant="secondary" dot>
            {badge}
          </Badge>
          <h2 id={`${title}-title`}>{title}</h2>
          <p>{description}</p>
        </div>

        <div className={styles.actions}>
          <Button>Ver prioridade</Button>
          <Button variant="outline">Pedir ajuda da Uni</Button>
        </div>
      </section>

      <section className={styles.grid} aria-label={`${title}: visão inicial`}>
        {cards.map((card) => (
          <Card key={card.title} variant={card.variant ?? 'default'} padding="lg" className={styles.card}>
            <div className={styles.cardHeader}>
              <span>{card.title}</span>
              <Badge variant={card.badgeVariant ?? 'outline'}>{card.badge}</Badge>
            </div>
            <strong>{card.metric}</strong>
            <p>{card.description}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}

export default PageScaffold;
