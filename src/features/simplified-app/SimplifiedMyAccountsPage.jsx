import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import { useAccounts, useFinancialBalances, useWorkspaceRole } from '../../hooks/index.js';
import { FINANCIAL_DATA_CHANGED_EVENT, notifyFinancialDataChanged } from '../../services/financialDataEvents.js';
import FinanceAccountModal from '../../pages/financeiro/FinanceAccountModal.jsx';
import Badge from '../../components/ui/Badge/Badge.jsx';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import {
  AddBankIcon,
  CheckIcon,
  MicIcon,
  RefreshIcon,
  SearchIcon,
  ShieldIcon,
} from './SimplifiedIcons.jsx';
import styles from './simplifiedMyAccounts.module.css';

const EMPTY_RECORDS = Object.freeze([]);

// Rotulos reais correspondentes ao check constraint accounts_account_type_check
// (supabase/migrations/20260711_002_financial_core.sql) -- os 7 unicos
// valores validos de account_type.
const ACCOUNT_TYPE_LABELS = Object.freeze({
  checking: 'Conta corrente',
  savings: 'Poupança',
  cash: 'Dinheiro',
  credit_card: 'Cartão de crédito',
  investment: 'Investimento',
  digital_wallet: 'Carteira digital',
  other: 'Outra conta',
});

const CHART_COLORS = Object.freeze(['#7c3aed', '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#22d3ee']);

function BackIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M20 6 10 16l10 10" />
    </svg>
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
}

function formatDateTime(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * ETAPA 4 -- Minhas contas (auditoria real confirmou): accounts.current_balance
 * é campo legado/cache "sem autoridade contábil" (comentário oficial da
 * migration 20260716_009) -- o saldo real é sempre o derivado via RPC
 * get_derived_account_balances(), o mesmo que useFinancialBalances() expõe
 * e que SimplifiedRecordsPage.jsx já usa para mesclar accounts+saldos.
 * source_type/sync_status/last_synced_at são campos reais, mas nenhuma
 * conta criada pelo fluxo real (source_type default 'manual') tem
 * sincronização de verdade -- por isso o status exibido é honesto por
 * conta em vez de sempre "Sincronizado". Adicionar/editar/excluir reaproveita
 * o FinanceAccountModal já existente (mesmo componente usado em
 * FinanceiroPage.jsx), sem nenhum CRUD paralelo.
 */
function SimplifiedMyAccountsPage() {
  const navigate = useNavigate();
  const { user, workspace } = useSession();
  const workspaceId = workspace?.id;

  const accountState = useAccounts({
    workspaceId,
    fallbackAccounts: EMPTY_RECORDS,
    fallbackAccountTypes: EMPTY_RECORDS,
  });
  const balanceState = useFinancialBalances({ workspaceId });
  const workspaceRole = useWorkspaceRole({
    workspaceId,
    ownerUserId: workspace?.owner_user_id,
    userId: user?.id,
  });

  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

  const refreshAll = () => Promise.all([accountState.refresh(), balanceState.refresh()]);

  useEffect(() => {
    function handleDataChanged(event) {
      if (event.detail?.source === 'simplified-my-accounts') return;
      void refreshAll();
    }
    window.addEventListener(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged);
    return () => window.removeEventListener(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshAll fecha sobre accountState/balanceState atuais a cada render, recriar o listener a cada mudanca e desnecessario
  }, []);

  const accountsWithBalance = useMemo(() => {
    const balanceMap = new Map(
      balanceState.accountBalances.map((balance) => [balance.account_id, balance.derived_balance]),
    );
    return accountState.activeAccounts.map((account) => ({
      ...account,
      derived_balance: Number(balanceMap.get(account.id) ?? account.initial_balance ?? 0),
    }));
  }, [accountState.activeAccounts, balanceState.accountBalances]);

  // Honesto: nenhuma conta criada pelo fluxo real tem sincronização de
  // verdade (source_type default 'manual'), mas o campo e real -- se algum
  // dia existir uma conta com sync_status/last_synced_at preenchidos, isso
  // aparece de verdade em vez de um rotulo fixo.
  const syncedAccounts = accountsWithBalance.filter((account) => (
    account.source_type && account.source_type !== 'manual' && account.last_synced_at
  ));
  const mostRecentSync = syncedAccounts
    .map((account) => account.last_synced_at)
    .sort()
    .at(-1);

  const chartSlices = useMemo(() => {
    const positive = accountsWithBalance.filter((account) => account.derived_balance > 0);
    if (positive.length < 2) return EMPTY_RECORDS;
    const total = positive.reduce((sum, account) => sum + account.derived_balance, 0);
    if (total <= 0) return EMPTY_RECORDS;
    return positive
      .map((account, index) => ({
        id: account.id,
        name: account.name,
        value: account.derived_balance,
        percent: (account.derived_balance / total) * 100,
        color: CHART_COLORS[index % CHART_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [accountsWithBalance]);

  const conicGradient = useMemo(() => {
    if (!chartSlices.length) return '';
    let cursor = 0;
    const stops = chartSlices.map((slice) => {
      const start = cursor;
      cursor += slice.percent;
      return `${slice.color} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }, [chartSlices]);

  const isLoading = accountState.isLoading || balanceState.isLoading;
  const hasAccounts = accountsWithBalance.length > 0;

  const heroTitle = hasAccounts
    ? 'A Uni está cuidando das suas contas.'
    : 'Vamos organizar suas contas?';
  const heroSubtitle = hasAccounts
    ? 'Tudo certo por aqui!'
    : 'Adicione sua primeira conta para começar a acompanhar seu dinheiro.';

  return (
    <div className={styles.page} data-simplified-my-accounts>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate(SIMPLIFIED_ROUTES.ACCOUNT)}
            aria-label="Voltar para Conta"
          >
            <BackIcon />
          </button>
          <h1>Minhas contas</h1>
        </div>
        <button type="button" className={styles.talkButton} onClick={() => navigate(SIMPLIFIED_ROUTES.UNI)}>
          <span className={styles.talkIcon} aria-hidden="true"><MicIcon /></span>
          Falar com a Uni
        </button>
      </header>

      <section className={styles.heroCard} aria-label="Status das suas contas">
        <div className={styles.heroTop}>
          <span className={styles.heroMascot} aria-hidden="true">🙂</span>
          <div className={styles.heroText}>
            <strong>{heroTitle}</strong>
            <p>{heroSubtitle}</p>
          </div>
          {hasAccounts ? (
            <span className={styles.heroCheck} aria-hidden="true"><CheckIcon /></span>
          ) : null}
        </div>
        {hasAccounts ? (
          <div className={styles.heroTiles}>
            <div className={styles.heroTile}>
              <span className={styles.heroTileIcon} aria-hidden="true"><RefreshIcon /></span>
              <div>
                <strong>{syncedAccounts.length > 0 ? 'Contas sincronizadas' : 'Contas organizadas manualmente'}</strong>
                <small>
                  {syncedAccounts.length > 0
                    ? `Última atualização: ${formatDateTime(mostRecentSync)}`
                    : 'Você mesmo mantém os saldos atualizados.'}
                </small>
              </div>
            </div>
            <div className={styles.heroTile}>
              <span className={styles.heroTileIcon} aria-hidden="true"><ShieldIcon /></span>
              <div>
                <strong>Tudo seguro</strong>
                <small>Seus dados ficam protegidos nesta conta.</small>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {isLoading ? (
        <p className={styles.loadingState}>Carregando suas contas...</p>
      ) : accountState.error ? (
        <p className={styles.errorBanner} role="alert">Não foi possível carregar suas contas agora. Tente novamente.</p>
      ) : hasAccounts ? (
        <>
          <h2 className={styles.sectionTitle}>Suas contas</h2>
          <div className={styles.accountList}>
            {accountsWithBalance.map((account) => {
              const isSynced = account.source_type && account.source_type !== 'manual' && account.last_synced_at;
              return (
                <button
                  key={account.id}
                  type="button"
                  className={styles.accountRow}
                  onClick={() => setIsAccountModalOpen(true)}
                >
                  <span className={styles.accountAvatar} aria-hidden="true">
                    {account.name.trim().slice(0, 2).toUpperCase()}
                  </span>
                  <div className={styles.accountInfo}>
                    <strong>{account.name}</strong>
                    <div className={styles.accountMetaRow}>
                      <small>{ACCOUNT_TYPE_LABELS[account.account_type] ?? account.account_type}</small>
                      <Badge variant={isSynced ? 'success' : 'default'} size="sm">
                        {isSynced ? 'Sincronizado' : 'Conta manual'}
                      </Badge>
                    </div>
                  </div>
                  <div className={styles.accountBalance}>
                    <strong className={account.derived_balance < 0 ? styles.negative : styles.positive}>
                      {formatCurrency(account.derived_balance)}
                    </strong>
                    <small>Saldo disponível</small>
                  </div>
                </button>
              );
            })}
          </div>

          {chartSlices.length > 0 ? (
            <section className={styles.chartCard} aria-label="Distribuição do seu dinheiro">
              <div
                className={styles.chartCircle}
                style={{ background: conicGradient }}
                role="img"
                aria-label={`Distribuição: ${chartSlices.map((s) => `${s.name} ${s.percent.toFixed(0)}%`).join(', ')}`}
              />
              <div className={styles.chartLegend}>
                <p className={styles.chartTitle}>Seu dinheiro está assim:</p>
                <div className={styles.chartItems}>
                  {chartSlices.map((slice) => (
                    <div key={slice.id} className={styles.chartItem}>
                      <strong style={{ color: slice.color }}>{slice.percent.toFixed(0)}%</strong>
                      <span>{slice.name}</span>
                      <small>{formatCurrency(slice.value)}</small>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <section className={styles.emptyCard} aria-label="Nenhuma conta cadastrada">
          <span className={styles.emptyIcon} aria-hidden="true"><AddBankIcon /></span>
          <strong>Você ainda não tem contas cadastradas.</strong>
          <p>Adicione sua primeira conta para acompanhar seus saldos e organizar sua vida financeira.</p>
        </section>
      )}

      <div className={styles.actionsGrid}>
        <button type="button" className={styles.actionTile} onClick={() => navigate(SIMPLIFIED_ROUTES.UNI)}>
          <span className={`${styles.actionIcon} ${styles.tonePurple}`} aria-hidden="true"><MicIcon /></span>
          <strong>Perguntar sobre minhas contas</strong>
          <small>Fale com a Uni</small>
        </button>
        <button type="button" className={styles.actionTile} onClick={() => setIsAccountModalOpen(true)}>
          <span className={`${styles.actionIcon} ${styles.toneBlue}`} aria-hidden="true"><AddBankIcon /></span>
          <strong>Adicionar nova conta</strong>
          <small>Cadastre uma conta real</small>
        </button>
        <button type="button" className={styles.actionTile} onClick={() => setIsAccountModalOpen(true)}>
          <span className={`${styles.actionIcon} ${styles.toneGreen}`} aria-hidden="true"><SearchIcon /></span>
          <strong>Ver detalhes das contas</strong>
          <small>Ver saldos e editar</small>
        </button>
      </div>

      <FinanceAccountModal
        open={isAccountModalOpen}
        accountState={accountState}
        canManage={workspaceRole.canUpdate === true}
        canDelete={workspaceRole.canDelete === true}
        onChanged={async () => {
          notifyFinancialDataChanged('simplified-my-accounts');
          await refreshAll();
        }}
        onClose={() => setIsAccountModalOpen(false)}
      />
    </div>
  );
}

export default SimplifiedMyAccountsPage;
