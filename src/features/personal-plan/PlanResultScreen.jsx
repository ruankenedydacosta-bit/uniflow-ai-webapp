import { UniRingOrb } from '../../components/ui/UniRingOrb/index.js';
import styles from './PersonalPlanReturn.module.css';

// Tela 21g–i: resultado do pagamento em tela cheia, sem cabeçalho. Orb de
// 120px, título, texto e, quando houver, um botão no rodapé. Serve ao Pix
// confirmado (PersonalPlanPage) e ao retorno do cartão (PersonalPlanReturnPage).
function PlanResultScreen({ orbState, title, description, action = null }) {
  return (
    <main className={styles.page}>
      <section className={styles.body} aria-live="polite">
        <UniRingOrb size={120} state={orbState} />
        <div className={styles.copy}>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </section>
      <div className={styles.footer}>{action}</div>
    </main>
  );
}

export default PlanResultScreen;
