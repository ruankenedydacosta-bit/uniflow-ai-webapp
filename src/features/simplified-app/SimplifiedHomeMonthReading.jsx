import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import IconBox from '../../components/ui/IconBox/index.js';
import { UniRingOrb } from '../../components/ui/UniRingOrb/index.js';
import { useCategories, useCategoryBudgets, useTransactions } from '../../hooks/index.js';
import { FINANCIAL_DATA_CHANGED_EVENT } from '../../services/financialDataEvents.js';
import { CategoryIcon } from '../categories/categoryIcons.jsx';
import { avisoDeMetaParaLeitura, TIPOS_DE_AVISO_DE_META } from '../goals/avisoDeMeta.js';
import { useGoals } from '../goals/useGoals.js';
import {
  buildHomeMonthFacts,
  buildHomeMonthReading,
  buildHomeMonthReadingRange,
  HOME_MONTH_READING_KINDS,
  HOME_MONTH_READING_LIMIT,
} from './homeMonthReading.js';
import { buildUniInsightsPayload, fingerprintPayload, toUniReadingItems } from './homeMonthUniReading.js';
import {
  PhCaretRightIcon,
  PhChartBarIcon,
  PhCheckCircleIcon,
  PhWarningCircleIcon,
} from './SimplifiedIcons.jsx';
import { getMonthRange } from './simplifiedRecordsData.js';
import { useHomeMonthUniReading } from './useHomeMonthUniReading.js';
import { metaPath, SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import styles from './simplifiedApp.module.css';

const CLOCK_FORMATTER = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

const TONE_CLASS = Object.freeze({
  [HOME_MONTH_READING_KINDS.OVER_BUDGET]: styles.homeReadingIconViolet,
  [HOME_MONTH_READING_KINDS.NEAR_BUDGET]: styles.homeReadingIconViolet,
  [HOME_MONTH_READING_KINDS.INCREASE]: styles.homeReadingIconViolet,
  [HOME_MONTH_READING_KINDS.TOP]: styles.homeReadingIconBlue,
  [HOME_MONTH_READING_KINDS.ON_TRACK]: styles.homeReadingIconGreen,
  [HOME_MONTH_READING_KINDS.DECREASE]: styles.homeReadingIconGreen,
  [TIPOS_DE_AVISO_DE_META.ATRASADA]: styles.homeReadingIconViolet,
  [TIPOS_DE_AVISO_DE_META.ATENCAO]: styles.homeReadingIconViolet,
  [TIPOS_DE_AVISO_DE_META.MARCO]: styles.homeReadingIconGreen,
});

const WARNING_KINDS = new Set([
  HOME_MONTH_READING_KINDS.OVER_BUDGET,
  HOME_MONTH_READING_KINDS.NEAR_BUDGET,
  HOME_MONTH_READING_KINDS.INCREASE,
  TIPOS_DE_AVISO_DE_META.ATRASADA,
  TIPOS_DE_AVISO_DE_META.ATENCAO,
]);
const POSITIVE_KINDS = new Set([
  HOME_MONTH_READING_KINDS.ON_TRACK,
  HOME_MONTH_READING_KINDS.DECREASE,
  TIPOS_DE_AVISO_DE_META.MARCO,
]);

// Aviso de meta (#162) → linha da leitura. Tocar abre o detalhe da meta.
function toGoalReadingItem(aviso) {
  return Object.freeze({
    id: `meta:${aviso.metaId}`,
    kind: aviso.tipo,
    categoryId: null,
    category: null,
    to: metaPath(aviso.metaId),
    title: aviso.titulo,
    detail: aviso.detalhe,
  });
}

function ReadingIcon({ reading }) {
  if (WARNING_KINDS.has(reading.kind)) return <PhWarningCircleIcon />;
  if (POSITIVE_KINDS.has(reading.kind)) return <PhCheckCircleIcon />;
  // Leitura geral da Uni, sem categoria: ícone de resumo.
  if (!reading.category) return <PhChartBarIcon />;
  return <CategoryIcon category={reading.category} />;
}

// Leitura do mês na Home (design 20b): bloco fixo logo abaixo da fala da Uni,
// com até três leituras sobre as saídas por categoria. Tocar numa leitura abre
// o Financeiro no histórico, filtrado pela categoria.
//
// As frases são da Uni (#122), escritas com IA a partir dos números do mês.
// Sem elas (falha, limite do dia, demora), vale a leitura calculada aqui.
// O aviso de meta (#162) é sempre calculado aqui e entra na frente, para o
// cache do dia da Uni não esconder uma meta que acabou de atrasar.
function SimplifiedHomeMonthReading() {
  const { user, workspace } = useSession();
  const workspaceId = workspace?.id;
  // "Hoje" anda quando o app volta do background: aberto em 30/set e
  // retomado em 01/out, o período buscado e a comparação passam para outubro.
  const [today, setToday] = useState(() => new Date());
  const range = buildHomeMonthReadingRange(today);

  // Mesmo contexto do Financeiro: a experiência simplificada é só Pessoal.
  const categoryState = useCategories({ workspaceId, context: 'personal' });
  const budgetState = useCategoryBudgets({ workspaceId });
  const transactionState = useTransactions({
    workspaceId,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    status: 'completed',
  });
  // Só metas ativas geram aviso. Os aportes do mês dizem se uma delas passou
  // de 50% ou 100% agora.
  const goalState = useGoals({ workspaceId, status: 'active', aportesDesde: getMonthRange(today).dateFrom });

  // Mesmos gatilhos da seção do mês: lançamento salvo em outra tela e app
  // voltando do background. O ref deixa o listener ser registrado uma vez só.
  const refreshRef = useRef(null);
  // useGoals já recarrega sozinho quando um lançamento é salvo: as metas só
  // entram na volta do background.
  useEffect(() => {
    refreshRef.current = ({ withGoals = false } = {}) => {
      setToday(new Date());
      void transactionState.refresh();
      void categoryState.refresh();
      void budgetState.refresh();
      if (withGoals) void goalState.refresh();
    };
  });

  useEffect(() => {
    const handleDataChanged = () => refreshRef.current?.();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshRef.current?.({ withGoals: true });
    };
    window.addEventListener(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Sem as categorias, toda saída cairia em "Outros": a leitura só é montada
  // depois que elas chegam. Ao recarregar, a lista anterior continua valendo.
  const categoriesReady = categoryState.categories.length > 0
    || (!categoryState.isLoading && !categoryState.error);
  // Sem os tetos, a leitura usaria a média e trocaria de frase quando eles
  // chegassem. Falha ao ler os tetos não segura a leitura: vale a média.
  const budgetsReady = budgetState.hasLoaded || Boolean(budgetState.error);
  const isReady = categoriesReady && budgetsReady;

  const facts = useMemo(
    () => (isReady
      ? buildHomeMonthFacts({
        transactions: transactionState.transactions,
        categories: categoryState.categories,
        budgets: budgetState.budgets,
        now: today,
      })
      : null),
    [isReady, transactionState.transactions, categoryState.categories, budgetState.budgets, today],
  );
  const payload = useMemo(() => (facts ? buildUniInsightsPayload(facts) : null), [facts]);
  const fingerprint = useMemo(() => (payload ? fingerprintPayload(payload) : null), [payload]);
  const uni = useHomeMonthUniReading({
    userId: user?.id,
    workspaceId,
    payload,
    fingerprint,
    enabled: isReady,
    pause: transactionState.isLoading || categoryState.isLoading || budgetState.isLoading,
  });

  // A hora de "Atualizada às" muda a cada resposta nova da consulta, não a
  // cada render.
  const calculated = useMemo(
    () => ({
      ...(isReady
        ? buildHomeMonthReading({
          transactions: transactionState.transactions,
          categories: categoryState.categories,
          budgets: budgetState.budgets,
          now: today,
        })
        : buildHomeMonthReading({ now: today })),
      updatedAtLabel: CLOCK_FORMATTER.format(new Date()),
    }),
    [isReady, transactionState.transactions, categoryState.categories, budgetState.budgets, today],
  );

  // Antes de a sessão trazer o espaço, os hooks respondem "espaço ausente":
  // isso é espera, não falha.
  const isWaitingWorkspace = !workspaceId;

  // A primeira leitura espera as metas, para o aviso não entrar depois e
  // empurrar as outras linhas. Falha ao ler as metas não segura a leitura:
  // ela só sai sem o aviso.
  const goalsPending = goalState.isLoading && goalState.goals.length === 0;
  const isLoadingData = isWaitingWorkspace || transactionState.isLoading
    || (categoryState.isLoading && !categoriesReady) || !budgetsReady || goalsPending;

  const goalNotice = useMemo(() => {
    const aviso = avisoDeMetaParaLeitura(goalState.goals, today);
    return aviso ? toGoalReadingItem(aviso) : null;
  }, [goalState.goals, today]);

  let reading = calculated;
  let isLoading = isLoadingData;
  if (uni.leituras && facts) {
    // Frases da Uni: as destes fatos ou, enquanto ela reescreve, as de hoje.
    reading = {
      ...calculated,
      readings: toUniReadingItems(uni.leituras, facts),
      updatedAtLabel: CLOCK_FORMATTER.format(new Date(uni.generatedAt)),
    };
  } else if (uni.status === 'loading') {
    // Sem frase guardada, o carregamento fica até a Uni responder ou o tempo
    // do pedido acabar; aí a leitura calculada entra.
    reading = { ...calculated, readings: [] };
    isLoading = true;
  }

  return (
    <SimplifiedHomeMonthReadingView
      isLoading={isLoading}
      error={isWaitingWorkspace ? null : (transactionState.error ?? categoryState.error)}
      reading={reading}
      goalNotice={goalNotice}
    />
  );
}

// Parte visual, separada dos dados para a vitrine /dev/redesign?tela=leitura.
//
// goalNotice (#162): linha da meta que precisa de atenção. Vem primeiro e
// ocupa uma das três linhas. Sem leituras do mês, aparece acima do aviso de
// erro ou de mês sem saídas.
export function SimplifiedHomeMonthReadingView({ isLoading, error, reading, goalNotice = null }) {
  const hasReadings = reading.readings.length > 0;
  const rows = goalNotice
    ? [goalNotice, ...reading.readings.slice(0, HOME_MONTH_READING_LIMIT - 1)]
    : reading.readings;

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
  } else {
    let message = null;
    if (error && !hasReadings) message = 'Não foi possível carregar a leitura do mês.';
    else if (!hasReadings) message = `Ainda não há saídas de ${reading.currentMonthName} até hoje.`;
    body = (
      <>
        {rows.length > 0 ? (
          <ul className={styles.homeReadingList}>
            {rows.map((item) => (
              <li key={item.id}>
                <Link
                  to={item.to ?? SIMPLIFIED_ROUTES.RECORDS}
                  state={item.to ? undefined : { categoryId: item.categoryId }}
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
        ) : null}
        {message ? <p className={styles.homeSectionEmpty}>{message}</p> : null}
      </>
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
