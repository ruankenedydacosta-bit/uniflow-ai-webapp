import { useState } from 'react';
import styles from './FinanceiroMobile.module.css';
import { financeiroMobileMock } from './financeiroMobile.mock.js';
import AccountsCarousel from './components/AccountsCarousel';
import AvailableBalanceCard from './components/AvailableBalanceCard';
import CardsWalletCarousel from './components/CardsWalletCarousel';
import CategoriesBreakdown from './components/CategoriesBreakdown';
import FinancialForecastCard from './components/FinancialForecastCard';
import FinanceiroEmptyState from './components/FinanceiroEmptyState';
import FinanceiroSectionSkeleton from './components/FinanceiroSectionSkeleton';
import IncomeExpenseChart from './components/IncomeExpenseChart';
import PeriodInsightText from './components/PeriodInsightText';
import PeriodSelectorBar from './components/PeriodSelectorBar';
import QuickActionSheet from './components/QuickActionSheet';
import RecentTransactionsList from './components/RecentTransactionsList';

function MobileFinanceiroView({ onManageAccounts, onManageCategories, onNewTransaction, viewState = 'ready' }) {
  const [periodIndex, setPeriodIndex] = useState(financeiroMobileMock.periods.length - 1);
  const [mode, setMode] = useState('Mês');
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const period = financeiroMobileMock.periods[periodIndex];

  function chooseQuickAction() {
    setQuickActionsOpen(false);
    onNewTransaction();
  }

  if (viewState === 'loading') {
    return <div className={styles.financeiro} data-finance-mobile="true" aria-busy="true">{Array.from({ length: 6 }, (_, index) => <FinanceiroSectionSkeleton key={index} />)}</div>;
  }

  if (viewState === 'empty') {
    return <div className={styles.financeiro} data-finance-mobile="true"><FinanceiroEmptyState onStart={onManageAccounts} /></div>;
  }

  return (
    <div className={styles.financeiro} data-finance-mobile="true">
      <PeriodSelectorBar period={period.label} mode={mode} onModeChange={setMode} onPrevious={() => setPeriodIndex((value) => Math.max(0, value - 1))} onNext={() => setPeriodIndex((value) => Math.min(financeiroMobileMock.periods.length - 1, value + 1))} canGoPrevious={periodIndex > 0} canGoNext={periodIndex < financeiroMobileMock.periods.length - 1} />
      <PeriodInsightText>{period.insight}</PeriodInsightText>
      <AvailableBalanceCard balance={period.balance} comparison={period.comparison} income={period.income} expense={period.expense} />
      <IncomeExpenseChart />
      <AccountsCarousel accounts={period.accounts} onManage={onManageAccounts} />
      <CardsWalletCarousel cards={period.cards} />
      <RecentTransactionsList transactions={period.transactions} onNew={onNewTransaction} />
      <CategoriesBreakdown categories={period.categories} onManage={onManageCategories} />
      <FinancialForecastCard forecast={period.forecast} />
      <button className="financeMobileFab" type="button" onClick={() => setQuickActionsOpen(true)} aria-label="Abrir ações financeiras rápidas">+</button>
      <QuickActionSheet open={quickActionsOpen} onClose={() => setQuickActionsOpen(false)} onAction={chooseQuickAction} />
    </div>
  );
}

export default MobileFinanceiroView;
