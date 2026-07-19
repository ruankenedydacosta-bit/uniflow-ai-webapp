import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccess } from '../app/AccessContext';
import { useSession } from '../app/SessionContext';
import { WORKSPACE_TYPES } from '../app/access.js';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { useAccounts, useCategories, useFinancialBalances, useTransactions } from '../hooks';
import { FINANCIAL_DATA_CHANGED_EVENT } from '../services/financialDataEvents.js';
import { cx } from '../utils/cx';
import { formatCurrency } from '../utils/formatters';
import FinanceAccountModal from './financeiro/FinanceAccountModal';
import FinanceCategoryModal from './financeiro/FinanceCategoryModal';
import FinanceProjectionChart from './financeiro/FinanceProjectionChart';
import FinanceTransactionModal from './financeiro/FinanceTransactionModal';
import { MobileFinanceiroView } from './financeiro/mobile';
import {
  fallbackAccountTypes,
  financialCrudMock,
} from './financeiro/financialCrud.mock.js';
import { financialMock } from './financeiro/financial.mock.js';
import styles from './FinanceiroPage.module.css';

function getFinancialContext(currentWorkspace) {
  return currentWorkspace === WORKSPACE_TYPES.PERSONAL ? financialMock.personal : financialMock.business;
}

function getCrudContext(currentWorkspace) {
  return currentWorkspace === WORKSPACE_TYPES.PERSONAL
    ? financialCrudMock.personal
    : financialCrudMock.business;
}

function formatMovementDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR').format(new Date(`${value}T12:00:00`));
}

function FinanceiroPage() {
  const { access } = useAccess();
  const { workspace } = useSession();
  const [activeDialog, setActiveDialog] = useState(null);
  const [transactionType, setTransactionType] = useState('expense');
  const financial = getFinancialContext(access.currentWorkspace);
  const crudFallback = getCrudContext(access.currentWorkspace);
  const accountState = useAccounts({
    workspaceId: workspace?.id,
    fallbackAccounts: crudFallback.accounts,
    fallbackAccountTypes,
  });
  const categoryState = useCategories({
    workspaceId: workspace?.id,
    fallbackCategories: crudFallback.categories,
  });
  const transactionState = useTransactions({
    workspaceId: workspace?.id,
    fallbackTransactions: crudFallback.transactions,
  });
  const balanceState = useFinancialBalances({ workspaceId: workspace?.id });
  const accountsWithDerivedBalance = useMemo(() => {
    const balanceByAccount = new Map(
      balanceState.accountBalances.map((balance) => [balance.account_id, balance]),
    );

    return accountState.accounts.map((account) => ({
      ...account,
      derived_balance: Number(
        balanceByAccount.get(account.id)?.derived_balance ?? account.initial_balance ?? 0,
      ),
    }));
  }, [accountState.accounts, balanceState.accountBalances]);
  const displayAccountState = useMemo(() => ({
    ...accountState,
    accounts: accountsWithDerivedBalance,
    activeAccounts: accountsWithDerivedBalance.filter((account) => account.is_active !== false),
  }), [accountState, accountsWithDerivedBalance]);
  const refreshFinancialData = useCallback(() => Promise.all([
    accountState.refresh(),
    categoryState.refresh(),
    transactionState.refresh(),
    balanceState.refresh(),
  ]), [accountState, balanceState, categoryState, transactionState]);
  const mobileError = accountState.error
    ?? categoryState.error
    ?? transactionState.error
    ?? balanceState.error;
  const mobileLoading = accountState.isLoading
    || categoryState.isLoading
    || transactionState.isLoading
    || balanceState.isLoading;
  const recentMovements = useMemo(
    () =>
      transactionState.transactions.slice(0, 3).map((transaction) => ({
        ...transaction,
        category:
          categoryState.categories.find(
            (category) => category.id === transaction.category_id,
          )?.name ?? 'Sem categoria',
        date: formatMovementDate(transaction.transaction_date),
        type:
          transaction.transaction_type === 'income'
            ? 'entrada'
            : transaction.transaction_type === 'expense'
              ? 'saida'
              : 'neutro',
      })),
    [categoryState.categories, transactionState.transactions],
  );

  useEffect(() => {
    const refresh = () => {
      void refreshFinancialData();
    };
    window.addEventListener(FINANCIAL_DATA_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(FINANCIAL_DATA_CHANGED_EVENT, refresh);
  }, [refreshFinancialData]);

  function openDialog(dialog, requestedTransactionType = 'expense') {
    accountState.clearError();
    categoryState.clearError();
    transactionState.clearError();
    balanceState.clearError();
    if (dialog === 'transactions') setTransactionType(requestedTransactionType);
    setActiveDialog(dialog);
  }

  return (
    <>
      <MobileFinanceiroView
        accountBalances={balanceState.accountBalances}
        accounts={accountState.accounts}
        categories={categoryState.categories}
        error={mobileError}
        isLoading={mobileLoading}
        onManageAccounts={() => openDialog('accounts')}
        onManageCategories={() => openDialog('categories')}
        onNewTransaction={(type) => openDialog('transactions', type)}
        onRetry={refreshFinancialData}
        transactions={transactionState.transactions}
        workspaceBalance={balanceState.workspaceBalance}
      />
      <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="financeiro-title">
        <div className={styles.heroCopy}>
          <Badge variant="secondary" dot>
            {financial.workspaceLabel}
          </Badge>
          <h2 id="financeiro-title">Financeiro</h2>
          <p>{financial.subtitle}</p>
        </div>

        <div className={styles.actions}>
          <Button>Registrar por voz</Button>
          <Button variant="secondary">Perguntar à Uni</Button>
        </div>
      </section>

      <section className={styles.focusGrid} aria-label="GPS financeiro">
        <Card variant="glass" padding="lg" className={styles.directionCard}>
          <div className={styles.cardHeader}>
            <span>Clareza financeira</span>
            <Badge variant="success" size="sm" dot>
              {financial.clarity.status}
            </Badge>
          </div>
          <strong>{financial.clarity.direction}</strong>
          <p>{financial.clarity.changed}</p>

          <FinanceProjectionChart chart={financial.projectionChart} />
        </Card>

        <Card variant="outline" padding="lg" className={styles.signalsCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>O que mudou</h3>
              <p>Três sinais suficientes para decidir sem ruído.</p>
            </div>
          </div>

          <div className={styles.signalList}>
            {financial.signals.map((signal) => (
              <div key={signal.label} className={styles.signalItem}>
                <span className={cx(styles.signalDot, styles[signal.tone])} aria-hidden="true" />
                <div>
                  <strong>{signal.label}</strong>
                  <p>{signal.description}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className={styles.guidanceGrid} aria-label="Orientação financeira">
        <Card variant="glass" padding="lg" className={styles.nextStepCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Próximo passo</h3>
              <p>Uma ação simples para manter a rota sem esforço extra.</p>
            </div>
            <Badge variant="glass" size="sm" dot>
              Uni
            </Badge>
          </div>
          <strong>{financial.clarity.nextStep}</strong>
        </Card>

        <Card variant="default" padding="lg" className={styles.uniCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Leitura da Uni</h3>
              <p>O que os dados indicam agora.</p>
            </div>
          </div>
          <p>{financial.uniReading}</p>
        </Card>
      </section>

      <section className={styles.movementsSection} aria-label="Movimentações recentes">
        <Card variant="outline" padding="lg">
          <div className={styles.sectionHeader}>
            <div>
              <h3>Movimentações recentes</h3>
              <p>Últimos eventos usados para alimentar a leitura da Uni.</p>
            </div>
            <div className={styles.actions}>
              <Button variant="ghost" size="sm" onClick={() => openDialog('accounts')}>
                Contas
              </Button>
              <Button variant="ghost" size="sm" onClick={() => openDialog('categories')}>
                Categorias
              </Button>
              <Button size="sm" onClick={() => openDialog('transactions')}>
                Novo lançamento
              </Button>
            </div>
          </div>
          <div className={styles.list}>
            {recentMovements.map((movement) => (
              <div key={movement.id} className={styles.movementRow}>
                <div className={styles.movementMain}>
                  <strong>{movement.description}</strong>
                  <span className={styles.movementMeta}>
                    {movement.category} · {movement.date}
                  </span>
                </div>
                <span className={cx(styles.amount, movement.type === 'entrada' ? styles.amountEntrada : styles.amountSaida)}>
                  {movement.type === 'entrada' ? '+' : '-'}
                  {formatCurrency(movement.amount)}
                </span>
              </div>
            ))}
            {!recentMovements.length ? (
              <div className={styles.movementRow}>
                <div className={styles.movementMain}>
                  <strong>
                    {transactionState.isLoading
                      ? 'Carregando lançamentos'
                      : transactionState.error
                        ? 'Não foi possível carregar os lançamentos'
                        : 'Nenhum lançamento registrado'}
                  </strong>
                  <span className={styles.movementMeta}>
                    {transactionState.error
                      ? 'Tente novamente pelo gerenciador de lançamentos.'
                      : 'Use “Novo lançamento” para começar.'}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      </section>

      </div>
      <FinanceAccountModal
        open={activeDialog === 'accounts'}
        onClose={() => setActiveDialog(null)}
        onChanged={refreshFinancialData}
        accountState={displayAccountState}
      />
      <FinanceCategoryModal
        open={activeDialog === 'categories'}
        onClose={() => setActiveDialog(null)}
        onChanged={refreshFinancialData}
        categoryState={categoryState}
      />
      <FinanceTransactionModal
        key={`transaction-${transactionType}`}
        open={activeDialog === 'transactions'}
        onClose={() => setActiveDialog(null)}
        onChanged={refreshFinancialData}
        initialType={transactionType}
        accountState={displayAccountState}
        categoryState={categoryState}
        transactionState={transactionState}
      />
    </>
  );
}

export default FinanceiroPage;
