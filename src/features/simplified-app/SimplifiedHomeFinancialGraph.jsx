import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import { useCategories, useTransactions } from '../../hooks';
import { FINANCIAL_DATA_CHANGED_EVENT } from '../../services/financialDataEvents.js';
import { CognitiveLiveChart } from '../cognitive-live-chart/index.js';
import { buildHomeFinancialGraphData } from './homeFinancialGraphData.js';
import { formatRelativeTransactionDate, getMonthRange } from './simplifiedRecordsData.js';
import { UniMark } from './SimplifiedIcons.jsx';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import styles from './SimplifiedHomeFinancialGraph.module.css';

const EMPTY_STATE = Object.freeze({
  message: 'Seus dados aparecerão aqui conforme você registrar entradas e saídas.',
  support: 'Toque em "Pergunte à Uni" para registrar sua primeira movimentação.',
});

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
  const { workspace } = useSession();
  const workspaceId = workspace?.id;
  const [recentView, setRecentView] = useState('expense');

  const month = useMemo(() => getMonthRange(new Date()), []);
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

  const graphData = useMemo(
    () => buildHomeFinancialGraphData({
      transactions: transactionState.transactions,
      categories: categoryState.categories,
    }),
    [transactionState.transactions, categoryState.categories],
  );

  const activeRecent = graphData.recent[recentView];
  const goToUni = () => navigate(SIMPLIFIED_ROUTES.UNI);

  return (
    <section className={styles.card} aria-labelledby="home-financial-graph-title">
      <header className={styles.header}>
        <span className={styles.eyebrow}>{graphData.periodLabel}</span>
        <h2 id="home-financial-graph-title">Seu fluxo financeiro</h2>
      </header>

      <CognitiveLiveChart
        variant="compact"
        defaultMode="overview"
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

      <button type="button" className={styles.askUniButton} onClick={goToUni}>
        <span className={styles.askUniMark} aria-hidden="true"><UniMark /></span>
        Pergunte à Uni sobre seus dados
      </button>
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
