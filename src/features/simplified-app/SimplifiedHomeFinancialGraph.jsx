import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import { useCategories, useTransactions } from '../../hooks';
import { FINANCIAL_DATA_CHANGED_EVENT } from '../../services/financialDataEvents.js';
import { CognitiveLiveChart } from '../cognitive-live-chart/index.js';
import {
  pickCacheableHomeFinancialData,
  readHomeFinancialCache,
  writeHomeFinancialCache,
} from './homeFinancialCache.js';
import { buildHomeFinancialGraphData } from './homeFinancialGraphData.js';
import SimplifiedReportCard from './SimplifiedReportCard.jsx';
import { formatRelativeTransactionDate, getMonthRange } from './simplifiedRecordsData.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import styles from './SimplifiedHomeFinancialGraph.module.css';

const EMPTY_STATE = Object.freeze({
  message: 'Seus dados aparecerão aqui conforme você registrar entradas e saídas.',
  support: 'Toque em "Pergunte à Uni" para registrar sua primeira movimentação.',
});

/**
 * HOME-INSTANT1: skeleton do bloco financeiro -- só aparece na PRIMEIRA
 * abertura de um mês (quando ainda não existe cache local). Reaproveita as
 * MESMAS classes de layout do card real (.card, .totalsRow, .totalCard,
 * .recentBlock...), então o espaço ocupado é idêntico ao do conteúdo que
 * vai substituí-lo -- nada salta de lugar quando os dados chegam.
 *
 * aria-hidden + role="status": o leitor de tela anuncia "carregando" uma
 * vez, em vez de ler dezenas de blocos vazios.
 */
function SimplifiedHomeFinancialGraphSkeleton() {
  return (
    <section className={styles.card} role="status" aria-label="Carregando seu fluxo financeiro">
      <header className={styles.header} aria-hidden="true">
        <span className={`${styles.skeletonLine} ${styles.skeletonEyebrow}`} />
        <span className={`${styles.skeletonLine} ${styles.skeletonTitle}`} />
      </header>

      {/* skeletonLine é quem traz fundo e onda -- sem ela a área do gráfico
          fica um vão invisível (pego em verificação visual). */}
      <div
        className={`${styles.skeletonLine} ${styles.chart} ${styles.skeletonChart}`}
        aria-hidden="true"
      />

      <div className={styles.totalsRow} aria-hidden="true">
        <div className={styles.totalCard}>
          <span className={`${styles.skeletonLine} ${styles.skeletonTotalHead}`} />
          <span className={`${styles.skeletonLine} ${styles.skeletonTotalValue}`} />
        </div>
        <div className={styles.totalCard}>
          <span className={`${styles.skeletonLine} ${styles.skeletonTotalHead}`} />
          <span className={`${styles.skeletonLine} ${styles.skeletonTotalValue}`} />
        </div>
      </div>

      <div className={styles.recentBlock} aria-hidden="true">
        <div className={styles.recentHead}>
          <span className={`${styles.skeletonLine} ${styles.skeletonRecentTitle}`} />
          <span className={`${styles.skeletonLine} ${styles.skeletonToggle}`} />
        </div>
        <div className={styles.skeletonRecentList}>
          <span className={`${styles.skeletonLine} ${styles.skeletonRecentRow}`} />
          <span className={`${styles.skeletonLine} ${styles.skeletonRecentRow}`} />
        </div>
      </div>

      <span className={`${styles.skeletonLine} ${styles.skeletonReportCard}`} aria-hidden="true" />
    </section>
  );
}

/**
 * HOME-GRAPH2: conteúdo real do bloco financeiro da Home.
 *
 * Busca com EXATAMENTE os mesmos parâmetros de Registros (status
 * 'completed' no servidor, categorias de contexto 'personal', intervalo do
 * mês via getMonthRange) -- parâmetros divergentes produzem números
 * divergentes, que foi parte do bug relatado no teste físico.
 */
function SimplifiedHomeFinancialGraphContent() {
  const navigate = useNavigate();
  const { user, workspace } = useSession();
  const userId = user?.id;
  const workspaceId = workspace?.id;
  const [recentView, setRecentView] = useState('expense');

  const month = useMemo(() => getMonthRange(new Date()), []);
  const periodKey = String(month.dateFrom).slice(0, 7);

  // HOME-INSTANT1: leitura SÍNCRONA (useMemo, nunca useEffect) -- é isso que
  // faz os números do último estado existirem já na PRIMEIRA renderização,
  // em vez de aparecerem só quando a API responde. useMemo em vez de
  // useState(inicializador) de propósito: no primeiro render a sessão pode
  // ainda não ter resolvido userId/workspaceId, e aqui o cache é relido
  // assim que eles chegam -- ainda antes de qualquer fetch terminar.
  const cachedData = useMemo(
    () => readHomeFinancialCache({ userId, workspaceId, periodKey }),
    [userId, workspaceId, periodKey],
  );

  const transactionState = useTransactions({
    workspaceId,
    dateFrom: month.dateFrom,
    dateTo: month.dateTo,
    status: 'completed',
  });
  const categoryState = useCategories({ workspaceId, context: 'personal' });

  // O gráfico fica na Home, mas a confirmação da Uni acontece na ROTA /uni,
  // onde este componente está DESMONTADO -- o evento chega e não há ninguém
  // ouvindo. Por isso a atualização tem três gatilhos complementares:
  // (1) o evento, para quando a confirmação acontece com a Home montada;
  // (2) o refetch de mount do próprio useTransactions, ao voltar para a Home;
  // (3) visibilitychange, para quando o app volta do background.
  //
  // O handler vive num ref para o listener ser registrado UMA vez: as
  // funções refresh vêm de objetos novos a cada render, e usá-las como
  // dependência re-registrava o listener em todo render.
  const refreshRef = useRef(null);
  // Sem lista de dependências: reaponta o ref depois de CADA render, então
  // o listener (registrado uma vez só, abaixo) sempre chama as funções de
  // refresh atuais -- nunca as capturadas no primeiro render.
  useEffect(() => {
    refreshRef.current = () => {
      void Promise.all([transactionState.refresh(), categoryState.refresh()]);
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

  const freshGraphData = useMemo(
    () => buildHomeFinancialGraphData({
      transactions: transactionState.transactions,
      categories: categoryState.categories,
    }),
    [transactionState.transactions, categoryState.categories],
  );

  const isLoadingFinancials = transactionState.isLoading || categoryState.isLoading;

  // Enquanto os dados frescos não chegam, o que já foi visto manda. Sem
  // cache, buildHomeFinancialGraphData sobre uma lista vazia produziria um
  // estado "R$ 0,00" -- exatamente a piscada de valores errados que o
  // carregamento progressivo tem que evitar; nesse caso vai skeleton.
  const graphData = isLoadingFinancials && cachedData
    ? cachedData
    : pickCacheableHomeFinancialData(freshGraphData, transactionState.transactions.length);

  const showSkeleton = isLoadingFinancials && !cachedData;

  // Persiste o último estado REAL (nunca o cache relido, nunca um estado
  // ainda carregando) para a próxima abertura do app.
  useEffect(() => {
    if (isLoadingFinancials) return;
    writeHomeFinancialCache({
      userId,
      workspaceId,
      periodKey,
      data: pickCacheableHomeFinancialData(freshGraphData, transactionState.transactions.length),
    });
  }, [
    isLoadingFinancials,
    freshGraphData,
    transactionState.transactions.length,
    userId,
    workspaceId,
    periodKey,
  ]);

  const activeRecent = graphData.recent[recentView];
  const goToUni = () => navigate(SIMPLIFIED_ROUTES.UNI);

  if (showSkeleton) return <SimplifiedHomeFinancialGraphSkeleton />;

  return (
    <section className={styles.card} aria-labelledby="home-financial-graph-title">
      <header className={styles.header}>
        <span className={styles.eyebrow}>{graphData.periodLabel}</span>
        <h2 id="home-financial-graph-title">Seu fluxo financeiro</h2>
      </header>

      <CognitiveLiveChart
        variant="compact"
        defaultMode="overview"
        className={styles.chart}
        data={graphData.chart.data}
        comparisonData={graphData.chart.data}
        forecastData={graphData.chart.data}
        todayDay={graphData.chart.todayDay}
        emptyState={{ ...EMPTY_STATE, ctaLabel: 'Pergunte à Uni', onCtaAction: goToUni }}
      />

      <div className={styles.totalsRow}>
        <div className={styles.totalCard}>
          <span className={styles.totalHead}>
            <span className={`${styles.totalDot} ${styles.totalDotIncome}`} aria-hidden="true" />
            Entradas
          </span>
          <strong className={styles.totalValueIncome}>{graphData.incomeLabel}</strong>
        </div>
        <div className={styles.totalCard}>
          <span className={styles.totalHead}>
            <span className={`${styles.totalDot} ${styles.totalDotExpense}`} aria-hidden="true" />
            Saídas
          </span>
          <strong className={styles.totalValueExpense}>{graphData.expenseLabel}</strong>
        </div>
      </div>

      <div className={styles.recentBlock}>
        <div className={styles.recentHead}>
          <h3 className={styles.recentTitle}>
            {recentView === 'expense' ? 'Saídas recentes' : 'Entradas recentes'}
          </h3>
          <div className={styles.toggle} role="tablist" aria-label="Selecionar tipo de movimentação">
            <button
              type="button"
              role="tab"
              aria-selected={recentView === 'expense'}
              className={recentView === 'expense' ? styles.toggleTabActive : styles.toggleTab}
              onClick={() => setRecentView('expense')}
            >
              Saídas
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={recentView === 'income'}
              className={recentView === 'income' ? styles.toggleTabActive : styles.toggleTab}
              onClick={() => setRecentView('income')}
            >
              Entradas
            </button>
          </div>
        </div>

        {activeRecent.length > 0 ? (
          <ul className={styles.recentList}>
            {activeRecent.map((movement) => (
              <li key={movement.id}>
                <button type="button" className={styles.recentRow} onClick={goToUni}>
                  <span className={styles.recentMain}>
                    <span className={styles.recentDescription}>{movement.description}</span>
                    <span className={styles.recentMeta}>
                      {`${movement.categoryName} • ${formatRelativeTransactionDate(movement.dateKey)}`}
                    </span>
                  </span>
                  <span
                    className={
                      recentView === 'expense'
                        ? styles.recentValueExpense
                        : styles.recentValueIncome
                    }
                  >
                    {movement.formattedAmount}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.recentEmpty}>
            {recentView === 'expense'
              ? 'Nenhuma saída neste período.'
              : 'Nenhuma entrada neste período.'}
          </p>
        )}
      </div>

      {/* Vem do mesmo `graphData` (cache ou fresco) -- assim o relatório
          também nasce com o número já conhecido, em vez de contar 0 até a
          consulta financeira responder. */}
      <SimplifiedReportCard transactionCount={graphData.transactionCount} />
    </section>
  );
}

/**
 * HOME-GRAPH1/2: wrapper com lazy mount via IntersectionObserver --
 * rootMargin de 200px dispara o mount um pouco ANTES da seção entrar na
 * viewport. Sem IntersectionObserver, monta direto (degrada com segurança).
 * Uma vez montado, nunca desmonta: a microentrada roda uma única vez, via
 * CSS no próprio mount, nunca a cada pixel de scroll.
 */
function SimplifiedHomeFinancialGraph() {
  const containerRef = useRef(null);
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    if (shouldMount) return undefined;
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setShouldMount(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setShouldMount(true);
      },
      { rootMargin: '200px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldMount]);

  return (
    <div ref={containerRef} className={styles.wrapper}>
      {shouldMount ? (
        <div className={styles.enter}>
          <SimplifiedHomeFinancialGraphContent />
        </div>
      ) : (
        <div className={styles.placeholder} aria-hidden="true" />
      )}
    </div>
  );
}

export default SimplifiedHomeFinancialGraph;
