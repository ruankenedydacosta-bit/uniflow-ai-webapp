import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import styles from '../UniAIPage.module.css';

function UniAIHero() {
  return (
    <section className={styles.hero} aria-labelledby="uni-ai-title">
      <div className={styles.heroCopy}>
        <Badge variant="secondary" dot>
          Uni ativa
        </Badge>
        <h2 id="uni-ai-title">Converse com a Uni</h2>
        <p>
          A Uni transforma seu contexto financeiro em clareza, próximos passos e orientação prática sem julgamento.
        </p>
      </div>

      <div className={styles.heroAction}>
        <Avatar name="Uni Flow" initials="U" size="xl" status="online" />
        <div className={styles.heroButtons}>
          <Button>Nova conversa</Button>
          <Button variant="outline">Ver contexto</Button>
        </div>
      </div>
    </section>
  );
}

export default UniAIHero;
