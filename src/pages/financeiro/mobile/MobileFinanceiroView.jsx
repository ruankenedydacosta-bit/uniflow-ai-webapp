import { useMemo, useState } from 'react';
import styles from './FinanceiroMobile.module.css';
import { buildFinanceiroMobileData } from './financeiroMobileData.js';
import AccountsCarousel from './components/AccountsCarousel';
import AvailableBalanceCard from './components/AvailableBalanceCard';
import CategoriesBreakdown from './components/CategoriesBreakdown';
import FinanceiroEmptyState from './components/FinanceiroEmptyState';
import FinanceiroErrorState from './components/FinanceiroErrorState';
import FinanceiroSectionSkeleton from './components/FinanceiroSectionSkeleton';
import IncomeExpenseChart from './components/IncomeExpenseChart';
import PeriodInsightText from './components/PeriodInsightText';
import PeriodSelectorBar from './components/PeriodSelectorBar';
import QuickActionSheet from './components/QuickActionSheet';
import RecentTransactionsList from './components/RecentTransactionsList';

function MobileFinanceiroView({
  accountBalances = [],
  accounts = [],
  categories = [],
  error = null,
  isLoading = false,
  onManageAccounts,
  onManageCategories,
  onNewTransaction,
  onRetry,
  transactions = [],
  workspaceBalance = null,
}) {
  const [periodOffset, setPeriodOffset] = useState(0);
  const [mode, setMode] = useState('Mês');
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const period = useMemo(() => buildFinanceiroMobileData({
    accountBalances,
    accounts,
    categories,
    mode,
    periodOffset,
    transactions,
    workspaceBalance,
  }), [accountBalances, accounts, categories, mode, periodOffset, transactions, workspaceBalance]);

  function chooseQuickAction(transactionType) {
    setQuickActionsOpen(false);
    onNewTransaction(transactionType);
  }

  if (isLoading) {
    return <div className={styles.financeiro} data-finance-mobile="true" aria-busy="true">{Array.from({ length: 6 }, (_, index) => <FinanceiroSectionSkeleton key={index} />)}</div>;
  }

  if (error) {
    return <div className={styles.financeiro} data-finance-mobile="true"><FinanceiroErrorState onRetry={onRetry} /></div>;
  }

  if (!accounts.length) {
    return <div className={styles.financeiro} data-finance-mobile="true"><FinanceiroEmptyState onStart={onManageAccounts} /></div>;
  }

  return (
    <div className={styles.financeiro} data-finance-mobile="true">
      <PeriodSelectorBar period={period.label} mode={mode} onModeChange={(value) => { setMode(value); setPeriodOffset(0); }} onPrevious={() => setPeriodOffset((value) => value - 1)} onNext={() => setPeriodOffset((value) => Math.min(0, value + 1))} canGoPrevious canGoNext={periodOffset < 0} />
      <PeriodInsightText>{period.insight}</PeriodInsightText>
      <AvailableBalanceCard balance={period.balance} comparison={period.comparison} income={period.income} expense={period.expense} />
      <IncomeExpenseChart chart={period.chart} />
      <AccountsCarousel accounts={period.accounts} onManage={onManageAccounts} />
      <RecentTransactionsList transactions={period.transactions} onNew={onNewTransaction} />
      <CategoriesBreakdown categories={period.categories} onManage={onManageCategories} />
      <button className="financeMobileFab" type="button" onClick={() => setQuickActionsOpen(true)} aria-label="Abrir ações financeiras rápidas">+</button>
      <QuickActionSheet open={quickActionsOpen} onClose={() => setQuickActionsOpen(false)} onAction={chooseQuickAction} />
    </div>
  );
}

export default MobileFinanceiroView;
