import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import ProgressBar from '../../components/ui/ProgressBar/index.js';
import { useTransactions } from '../../hooks';
import { FINANCIAL_DATA_CHANGED_EVENT } from '../../services/financialDataEvents.js';
import { formatCurrency } from '../../utils/formatters.js';
import {
  pickCacheableHomeFinancialData,
  readHomeFinancialCache,
  writeHomeFinancialCache,
} from './homeFinancialCache.js';
import { buildHomeFinancialGraphData } from './homeFinancialGraphData.js';
import SimplifiedReportCard from './SimplifiedReportCard.jsx';
import { getMonthRange } from './simplifiedRecordsData.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import { useNumeroContado } from './useNumeroContado.js';
import styles from './SimplifiedHomeFinancialGraph.module.css';

/**
 * HOME-INSTANT1: skeleton da seção do mês -- só aparece na PRIMEIRA
 * abertura de um mês (quando ainda não existe cache local). Reaproveita as
 * MESMAS classes de layout da seção real (.card, .header, .totalsRow,
 * .totalCard), então o espaço ocupado é idêntico ao do conteúdo que vai
 * substituí-lo -- nada salta de lugar quando os dados chegam.
 *
 * aria-hidden + role="status": o leitor de tela anuncia "carregando" uma
 * vez, em vez de ler dezenas de blocos vazios.
 */
function SimplifiedHomeFinancialGraphSkeleton() {
  return (
    <section className={styles.card} role="status" aria-label="Carregando seu fluxo financeiro">
      <header className={styles.header} aria-hidden="true">
        <span className={`${styles.skeletonLine} ${styles.skeletonTitle}`} />
        <span className={`${styles.skeletonLine} ${styles.skeletonLink}`} />
      </header>

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

      <span className={`${styles.skeletonLine} ${styles.skeletonBar}`} aria-hidden="true" />
      <span className={`${styles.skeletonLine} ${styles.skeletonReportCard}`} aria-hidden="true" />
    </section>
  );
}

/**
 * HOME-GRAPH2: conteúdo real da seção do mês na Home. No redesign (#89) a
 * seção mostra o mês, Entradas e Saídas e quanto do que entrou já saiu; o
 * gráfico e a lista de movimentações ficam no Financeiro.
 *
 * Busca com EXATAMENTE os mesmos parâmetros de Registros (status
 * 'completed' no servidor, intervalo do mês via getMonthRange) --
 * parâmetros divergentes produzem números divergentes, que foi parte do
 * bug relatado no teste físico.
 */
function SimplifiedHomeFinancialGraphContent() {
  const { user, workspace } = useSession();
  const userId = user?.id;
  const workspaceId = workspace?.id;

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

  // A seção fica na Home, mas a confirmação da Uni acontece na ROTA /uni,
  // onde este componente está DESMONTADO -- o evento chega e não há ninguém
  // ouvindo. Por isso a atualização tem três gatilhos complementares:
  // (1) o evento, para quando a confirmação acontece com a Home montada;
  // (2) o refetch de mount do próprio useTransactions, ao voltar para a Home;
  // (3) visibilitychange, para quando o app volta do background.
  //
  // O handler vive num ref para o listener ser registrado UMA vez: a
  // função refresh vem de um objeto novo a cada render, e usá-la como
  // dependência re-registrava o listener em todo render.
  const refreshRef = useRef(null);
  // Sem lista de dependências: reaponta o ref depois de CADA render, então
  // o listener (registrado uma vez só, abaixo) sempre chama a função de
  // refresh atual -- nunca a capturada no primeiro render.
  useEffect(() => {
    refreshRef.current = () => {
      void transactionState.refresh();
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
    () => buildHomeFinancialGraphData({ transactions: transactionState.transactions }),
    [transactionState.transactions],
  );

  const isLoadingFinancials = transactionState.isLoading;

  // Enquanto os dados frescos não chegam, o que já foi visto manda. Sem
  // cache, buildHomeFinancialGraphData sobre uma lista vazia produziria um
  // estado "R$ 0,00" -- exatamente a piscada de valores errados que o
  // carregamento progressivo tem que evitar; nesse caso vai skeleton.
  const graphData = isLoadingFinancials && cachedData
    ? cachedData
    : pickCacheableHomeFinancialData(freshGraphData, transactionState.transactions.length);

  const showSkeleton = isLoadingFinancials && !cachedData;

  // Entradas e Saídas contam do último valor visto ao fresco quando ele
  // chega (ao voltar para a aba, por exemplo), e do zero depois do esqueleto.
  const [shownIncome, incomeValueRef] = useNumeroContado(graphData.income, {
    segurar: isLoadingFinancials,
    esqueleto: showSkeleton,
  });
  const [shownExpense, expenseValueRef] = useNumeroContado(graphData.expense, {
    segurar: isLoadingFinancials,
    esqueleto: showSkeleton,
  });

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

  if (showSkeleton) return <SimplifiedHomeFinancialGraphSkeleton />;

  // Cache gravado antes do redesign não tem monthTitle nem usedShare: o
  // título cai no rótulo do período e a barra só entra com o dado fresco.
  const usedShare = typeof graphData.usedShare === 'number' ? graphData.usedShare : null;

  return (
    <section className={styles.card} aria-labelledby="home-financial-graph-title">
      <header className={styles.header}>
        <h2 id="home-financial-graph-title">{graphData.monthTitle ?? graphData.periodLabel}</h2>
        <Link to={SIMPLIFIED_ROUTES.RECORDS}>Ver Financeiro</Link>
      </header>

      <div className={styles.totalsRow}>
        <div className={styles.totalCard}>
          <span className={styles.totalHead}>Entradas</span>
          <strong className={styles.totalValueIncome} ref={incomeValueRef}>
            {Number.isFinite(shownIncome) ? formatCurrency(shownIncome) : graphData.incomeLabel}
          </strong>
        </div>
        <div className={styles.totalCard}>
          <span className={styles.totalHead}>Saídas</span>
          <strong className={styles.totalValueExpense} ref={expenseValueRef}>
            {Number.isFinite(shownExpense) ? formatCurrency(shownExpense) : graphData.expenseLabel}
          </strong>
        </div>
      </div>

      {usedShare !== null ? (
        <>
          <ProgressBar value={usedShare} />
          <p className={styles.usage}>{`Você usou ${usedShare}% do que entrou no mês.`}</p>
        </>
      ) : null}

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
