import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import IconBox from '../../components/ui/IconBox/index.js';
import { UniRingOrb } from '../../components/ui/UniRingOrb/index.js';
import { useCategories, useTransactions } from '../../hooks/index.js';
import { FINANCIAL_DATA_CHANGED_EVENT } from '../../services/financialDataEvents.js';
import { CategoryIcon } from '../categories/categoryIcons.jsx';
import {
  buildHomeMonthReading,
  buildHomeMonthReadingRange,
  HOME_MONTH_READING_KINDS,
} from './homeMonthReading.js';
import { PhCaretRightIcon, PhCheckCircleIcon, PhWarningCircleIcon } from './SimplifiedIcons.jsx';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import styles from './simplifiedApp.module.css';

const CLOCK_FORMATTER = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

const TONE_CLASS = Object.freeze({
  [HOME_MONTH_READING_KINDS.INCREASE]: styles.homeReadingIconViolet,
  [HOME_MONTH_READING_KINDS.TOP]: styles.homeReadingIconBlue,
  [HOME_MONTH_READING_KINDS.DECREASE]: styles.homeReadingIconGreen,
});

function ReadingIcon({ reading }) {
  if (reading.kind === HOME_MONTH_READING_KINDS.INCREASE) return <PhWarningCircleIcon />;
  if (reading.kind === HOME_MONTH_READING_KINDS.DECREASE) return <PhCheckCircleIcon />;
  return <CategoryIcon category={reading.category} />;
}

// Leitura do mês na Home (design 20b): bloco fixo logo abaixo da fala da Uni,
// com até três leituras sobre as saídas por categoria. Tocar numa leitura abre
// o Financeiro no histórico, filtrado pela categoria.
function SimplifiedHomeMonthReading() {
  const { workspace } = useSession();
  const workspaceId = workspace?.id;
  const now = useMemo(() => new Date(), []);
  const range = useMemo(() => buildHomeMonthReadingRange(now), [now]);

  // Mesmo contexto do Financeiro: a experiência simplificada é só Pessoal.
  const categoryState = useCategories({ workspaceId, context: 'personal' });
  const transactionState = useTransactions({
    workspaceId,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    status: 'completed',
  });

  // Mesmos gatilhos da seção do mês: lançamento salvo em outra tela e app
  // voltando do background. O ref deixa o listener ser registrado uma vez só.
  const refreshRef = useRef(null);
  useEffect(() => {
    refreshRef.current = () => {
      void transactionState.refresh();
      void categoryState.refresh();
    };
  });

  useEffect(() => {
    const handleDataChanged = () => refreshRef.current?.();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshRef.current?.();
    };
    window.addEventListener(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // A hora de "Atualizada às" muda a cada resposta nova da consulta, não a
  // cada render.
  const reading = useMemo(
    () => ({
      ...buildHomeMonthReading({
        transactions: transactionState.transactions,
        categories: categoryState.categories,
        now: new Date(),
      }),
      updatedAtLabel: CLOCK_FORMATTER.format(new Date()),
    }),
    [transactionState.transactions, categoryState.categories],
  );

  return (
    <SimplifiedHomeMonthReadingView
      isLoading={transactionState.isLoading || categoryState.isLoading}
      error={transactionState.error ?? categoryState.error}
      reading={reading}
    />
  );
}

// Parte visual, separada dos dados para a vitrine /dev/redesign?tela=leitura.
export function SimplifiedHomeMonthReadingView({ isLoading, error, reading }) {
  const hasReadings = reading.readings.length > 0;

  // Ao recarregar, as leituras anteriores ficam na tela até a resposta chegar.
  let body;
  if (isLoading && !hasReadings) {
    body = (
      <div
        className={`${styles.homeSectionSkeleton} ${styles.homeReadingSkeleton}`}
        role="status"
        aria-label="Carregando a leitura do mês"
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </div>
    );
  } else if (error && !hasReadings) {
    body = <p className={styles.homeSectionEmpty}>Não foi possível carregar a leitura do mês.</p>;
  } else if (!hasReadings) {
    body = (
      <p className={styles.homeSectionEmpty}>
        {`Registre uma saída em ${reading.currentMonthName} para ver a leitura do mês.`}
      </p>
    );
  } else {
    body = (
      <ul className={styles.homeReadingList}>
        {reading.readings.map((item) => (
          <li key={item.id}>
            <Link
              to={SIMPLIFIED_ROUTES.RECORDS}
              state={{ categoryId: item.categoryId }}
              className={styles.homeReadingRow}
            >
              <IconBox className={`${styles.homeReadingIcon} ${TONE_CLASS[item.kind]}`}>
                <ReadingIcon reading={item} />
              </IconBox>
              <span className={styles.homeReadingText}>
                <span className={styles.homeReadingTitle}>{item.title}</span>
                <span className={styles.homeReadingDetail}>{item.detail}</span>
              </span>
              <span className={styles.homeReadingCaret} aria-hidden="true">
                <PhCaretRightIcon />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section className={styles.homeSection} aria-labelledby="home-month-reading-title">
      <div className={styles.homeSectionHead}>
        <h2 id="home-month-reading-title" className={styles.homeReadingHeading}>
          <UniRingOrb size={16} />
          Leitura do mês
        </h2>
        {hasReadings ? (
          <span className={styles.homeReadingUpdated}>{`Atualizada às ${reading.updatedAtLabel}`}</span>
        ) : null}
      </div>
      {body}
    </section>
  );
}

export default SimplifiedHomeMonthReading;
