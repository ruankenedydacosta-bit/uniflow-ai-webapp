import { useEffect, useState } from 'react';
import DraftCard from '../../../components/ui/DraftCard/index.js';
import FilterChips from '../../../components/ui/FilterChips/index.js';
import IconBox from '../../../components/ui/IconBox/index.js';
import OutlineButton from '../../../components/ui/OutlineButton/index.js';
import ProgressBar from '../../../components/ui/ProgressBar/index.js';
import Segmented from '../../../components/ui/Segmented/index.js';
import Timeline from '../../../components/ui/Timeline/index.js';
import Toggle from '../../../components/ui/Toggle/index.js';
import UniCard from '../../../components/ui/UniCard/index.js';
import { UniRingOrb } from '../../../components/ui/UniRingOrb/index.js';
import { UNI_RING_ORB_STATES } from '../../../components/ui/UniRingOrb/uniRingOrbModel.js';
import SimplifiedBottomNavigation from '../../../features/simplified-app/SimplifiedBottomNavigation.jsx';
import { ensureAppFont } from '../../../features/simplified-app/appFont.js';
import SimplifiedHeader from '../../../features/simplified-app/SimplifiedHeader.jsx';
import { PhBankIcon, PhCheckIcon } from '../../../features/simplified-app/SimplifiedIcons.jsx';
import appStyles from '../../../features/simplified-app/simplifiedApp.module.css';
import { THEME_OPTIONS, useTheme } from '../../../features/theme/index.js';
import styles from './RedesignShowcasePage.module.css';

const ORB_MODES = [
  [UNI_RING_ORB_STATES.IDLE, 'Parada'],
  [UNI_RING_ORB_STATES.LISTENING, 'Ouvindo'],
  [UNI_RING_ORB_STATES.THINKING, 'Pensando'],
  [UNI_RING_ORB_STATES.SPEAKING, 'Falando'],
];

// Textos de exemplo copiados das telas do handoff.
const TIMELINE = [
  { id: 1, time: '08:30', title: 'Dentista', detail: 'Dra. Paula · Av. Paulista', tone: 'blue', status: 'next' },
  { id: 2, time: '12:00', title: 'Pagar fatura Nubank', detail: 'R$ 1.240 · lembrete às 11h', tone: 'violet' },
  { id: 3, time: '19:00', title: 'Aniversário da Ana', detail: 'Você ainda não comprou o presente', tone: 'green', highlightDetail: true },
];

// Vitrine só de desenvolvimento (épico #91): mostra a base do redesign com
// as mesmas classes do shell do app, para comparar com o handoff em 390px
// sem precisar de sessão.
function RedesignShowcasePage() {
  const { selectedTheme, setTheme } = useTheme();
  const [filter, setFilter] = useState('todas');
  const [segment, setSegment] = useState('saida');
  const [toggled, setToggled] = useState(true);

  useEffect(() => {
    document.body.setAttribute('data-simplified-app-mounted', 'true');
    ensureAppFont(document);
    return () => document.body.removeAttribute('data-simplified-app-mounted');
  }, []);

  return (
    <div className={appStyles.shell} data-simplified-app-shell>
      <div className={appStyles.shellSurface}>
        <div className={appStyles.shellTopRegion}>
          <SimplifiedHeader unreadCount={3} profileName="Jonatas Oliveira" />
        </div>

        <main className={`${appStyles.mainContent} ${styles.content}`}>
          <section className={styles.section}>
            <h2 className={styles.label}>Tema</h2>
            <div className={styles.row}>
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={styles.chip}
                  aria-pressed={selectedTheme === option.id}
                  onClick={() => setTheme(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.label}>Uni Orb</h2>
            <div className={styles.orbGrid}>
              {ORB_MODES.map(([state, label]) => (
                <figure key={state} className={styles.orbItem}>
                  <UniRingOrb size={64} state={state} />
                  <figcaption>{label}</figcaption>
                </figure>
              ))}
            </div>
            <div className={styles.row}>
              {[18, 22, 28, 120].map((size) => <UniRingOrb key={size} size={size} />)}
            </div>
          </section>

          <UniCard
            time="21:40"
            title="A fatura do Nubank, de R$ 1.240, vence amanhã. Seu saldo fica baixo até o dia 5."
            actions={(
              <>
                <OutlineButton>Separar o valor</OutlineButton>
                <OutlineButton variant="ghost">Lembrar amanhã</OutlineButton>
              </>
            )}
          />

          <DraftCard
            kind="Saída · rascunho"
            tag="Alimentação"
            amount="R$ 42,00"
            details={[
              { label: 'Local', value: 'Padaria Pão Nosso' },
              { label: 'Conta', value: 'Nubank · débito' },
            ]}
            confirmIcon={<PhCheckIcon />}
            onConfirm={() => {}}
            onEdit={() => {}}
            onCancel={() => {}}
          />

          <section className={styles.section}>
            <h2 className={styles.label}>Controles</h2>
            <FilterChips
              label="Filtrar movimentações"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'todas', label: 'Todas' },
                { value: 'entradas', label: 'Entradas' },
                { value: 'saidas', label: 'Saídas' },
              ]}
            />
            <Segmented
              label="Tipo de movimentação"
              value={segment}
              onChange={setSegment}
              options={[
                { value: 'saida', label: 'Saída' },
                { value: 'entrada', label: 'Entrada' },
                { value: 'transferencia', label: 'Transferência' },
              ]}
            />
            <div className={styles.row}>
              <Toggle checked={toggled} onChange={setToggled} label="Exemplo de interruptor" />
              <IconBox><PhBankIcon /></IconBox>
            </div>
            <ProgressBar value={35} label="Usado no mês" />
            <ProgressBar value={60} tone="green" label="Meta" />
          </section>

          <section className={styles.section}>
            <h2 className={styles.label}>Timeline</h2>
            <Timeline label="Amanhã" items={TIMELINE} />
          </section>
        </main>

        <SimplifiedBottomNavigation />
      </div>
    </div>
  );
}

export default RedesignShowcasePage;
