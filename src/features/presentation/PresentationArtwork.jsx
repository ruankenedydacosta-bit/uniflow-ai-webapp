import { UniRingOrb } from '../../components/ui/UniRingOrb/index.js';
import { UNI_RING_ORB_STATES } from '../../components/ui/UniRingOrb/uniRingOrbModel.js';
import { PhShieldCheckIcon } from '../simplified-app/SimplifiedIcons.jsx';
import styles from './Presentation.module.css';

// Tela 21a–c: a arte de cada slide usa peças reais do app, nunca ilustração
// própria. 21a: o orb da Uni ouvindo. 21b: o card de rascunho e um item da
// agenda, com dados de exemplo. 21c: o escudo sobre um halo violeta.
function PiecesArtwork() {
  return (
    <div className={styles.pieces} aria-hidden="true">
      <div className={styles.pieceDraft}>
        <div className={styles.pieceDraftHeader}>
          <span>Saída · rascunho</span>
          <span className={styles.pieceTag}>Alimentação</span>
        </div>
        <span className={styles.pieceAmount}>R$ 42,00</span>
        <span className={styles.pieceMeta}>Padaria Pão Nosso · Nubank</span>
      </div>
      <div className={styles.pieceAgenda}>
        <span className={styles.pieceTime}>08:30</span>
        <div>
          <div className={styles.pieceTitle}>Dentista</div>
          <div className={styles.pieceMeta}>Amanhã · lembrete 1h antes</div>
        </div>
      </div>
    </div>
  );
}

function ShieldArtwork() {
  return (
    <div className={styles.shield} aria-hidden="true">
      <span className={styles.shieldHalo} />
      <span className={styles.shieldBadge}><PhShieldCheckIcon /></span>
    </div>
  );
}

function PresentationArtwork({ type }) {
  if (type === 'pieces') return <PiecesArtwork />;
  if (type === 'shield') return <ShieldArtwork />;
  return <UniRingOrb size={200} state={UNI_RING_ORB_STATES.LISTENING} />;
}

export default PresentationArtwork;
