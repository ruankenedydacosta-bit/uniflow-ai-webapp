import { useMemo, useState } from 'react';
import { useAccess } from '../app/AccessContext';
import { useSession } from '../app/SessionContext';
import { WORKSPACE_TYPES } from '../app/access.js';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { useAccounts, useCategories, useTransactions } from '../hooks';
import { cx } from '../utils/cx';
import { formatCurrency } from '../utils/formatters';
import FinanceAccountModal from './financeiro/FinanceAccountModal';
import FinanceCategoryModal from './financeiro/FinanceCategoryModal';
import FinanceProjectionChart from './financeiro/FinanceProjectionChart';
import FinanceTransactionModal from './financeiro/FinanceTransactionModal';
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

  function openDialog(dialog) {
    accountState.clearError();
    categoryState.clearError();
    transactionState.clearError();
    setActiveDialog(dialog);
  }

  return (
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

      <FinanceAccountModal
        open={activeDialog === 'accounts'}
        onClose={() => setActiveDialog(null)}
        accountState={accountState}
      />
      <FinanceCategoryModal
        open={activeDialog === 'categories'}
        onClose={() => setActiveDialog(null)}
        categoryState={categoryState}
      />
      <FinanceTransactionModal
        open={activeDialog === 'transactions'}
        onClose={() => setActiveDialog(null)}
        accountState={accountState}
        categoryState={categoryState}
        transactionState={transactionState}
      />
    </div>
  );
}

export default FinanceiroPage;
