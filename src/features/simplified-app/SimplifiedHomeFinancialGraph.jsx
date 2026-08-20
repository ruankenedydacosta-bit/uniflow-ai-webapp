import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import { useCategories, useTransactions } from '../../hooks';
import { FINANCIAL_DATA_CHANGED_EVENT } from '../../services/financialDataEvents.js';
import { CognitiveLiveChart } from '../cognitive-live-chart/index.js';
import { getFinancialPeriod } from '../../pages/financeiro/mobile/financeiroMobileData.js';
import { buildHomeFinancialGraphData } from './homeFinancialGraphData.js';
import { UniMark } from './SimplifiedIcons.jsx';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import styles from './SimplifiedHomeFinancialGraph.module.css';

const EMPTY_STATE = Object.freeze({
  message: 'Seus dados aparecerão aqui conforme você registrar entradas e saídas.',
  support: 'Toque em "Pergunte à Uni" para registrar sua primeira movimentação.',
});

/**
 * HOME-GRAPH1: conteúdo de verdade -- só MONTA (nunca só renderiza
 * escondido) quando o wrapper abaixo decide que a seção está perto da
 * viewport, então os hooks de fetch (useTransactions/useCategories) só
 * começam a rodar nesse momento, nunca antes (Home inicial continua
 * rápida).
 *
 * Fonte real: MESMOS hooks que Registros/Financeiro já usam, nunca um
 * segundo estado financeiro. Mesmo evento (FINANCIAL_DATA_CHANGED_EVENT)
 * que Registros escuta -- confirmar uma Entrada/Saída na Uni já dispara
 * este evento (ver confirmedFinancialActionService.js), então o gráfico
 * atualiza sozinho, sem reload/refresh manual.
 */
function SimplifiedHomeFinancialGraphContent() {
  const navigate = useNavigate();
  const { workspace } = useSession();
  const workspaceId = workspace?.id;
  const [categoryView, setCategoryView] = useState('expense');

  const period = useMemo(() => getFinancialPeriod({ mode: 'Mês', offset: 0 }), []);
  const transactionState = useTransactions({
    workspaceId,
    dateFrom: period.startKey,
    dateTo: period.endKey,
  });
  const categoryState = useCategories({ workspaceId });

  useEffect(() => {
    const handleDataChanged = () => {
      void Promise.all([transactionState.refresh(), categoryState.refresh()]);
    };
    window.addEventListener(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged);
    return () => window.removeEventListener(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged);
  }, [transactionState, categoryState]);

  const graphData = useMemo(
    () => buildHomeFinancialGraphData({
      transactions: transactionState.transactions,
      categories: categoryState.categories,
    }),
    [transactionState.transactions, categoryState.categories],
  );

  const activeCategories = graphData.categories[categoryView];
  const goToUni = () => navigate(SIMPLIFIED_ROUTES.UNI);

  return (
    <section className={styles.card} aria-labelledby="home-financial-graph-title">
      <header className={styles.header}>
        <span className={styles.eyebrow}>{period.label}</span>
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
        <div className={styles.totalItem}>
          <span className={styles.totalLabel}>Entradas</span>
          <strong className={styles.totalValueIncome}>{graphData.incomeLabel}</strong>
        </div>
        <div className={styles.totalItem}>
          <span className={styles.totalLabel}>Saídas</span>
          <strong className={styles.totalValueExpense}>{graphData.expenseLabel}</strong>
        </div>
      </div>

      {graphData.hasMovements ? (
        <div className={styles.categoriesBlock}>
          <div className={styles.categoryToggle} role="tablist" aria-label="Selecionar tipo de categoria">
            <button
              type="button"
              role="tab"
              aria-selected={categoryView === 'expense'}
              className={categoryView === 'expense' ? styles.toggleTabActive : styles.toggleTab}
              onClick={() => setCategoryView('expense')}
            >
              Saídas
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={categoryView === 'income'}
              className={categoryView === 'income' ? styles.toggleTabActive : styles.toggleTab}
              onClick={() => setCategoryView('income')}
            >
              Entradas
            </button>
          </div>

          {activeCategories.length > 0 ? (
            <ul className={styles.categoryList}>
              {activeCategories.map((category) => (
                <li key={category.id}>
                  <button type="button" className={styles.categoryRow} onClick={goToUni}>
                    <span className={styles.categoryName}>{category.name}</span>
                    <span className={styles.categoryValue}>{category.formattedValue}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.categoriesEmpty}>
              {categoryView === 'expense' ? 'Nenhuma saída com categoria neste período.' : 'Nenhuma entrada com categoria neste período.'}
            </p>
          )}
        </div>
      ) : null}

      <button type="button" className={styles.askUniButton} onClick={goToUni}>
        <span className={styles.askUniMark} aria-hidden="true"><UniMark /></span>
        Pergunte à Uni sobre seus dados
      </button>
    </section>
  );
}

/**
 * HOME-GRAPH1: wrapper com lazy mount via IntersectionObserver --
 * rootMargin de 200px dispara o mount um pouco ANTES da seção realmente
 * entrar na viewport (o fetch já está em andamento quando o usuário
 * termina de rolar até ela). Sem IntersectionObserver disponível, monta
 * direto (degrada de forma segura, nunca esconde a seção para sempre).
 * Uma vez montado, nunca desmonta de novo -- a microentrada (opacity+
 * translateY) roda uma única vez, via CSS no próprio mount, nunca a cada
 * pixel de scroll.
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
