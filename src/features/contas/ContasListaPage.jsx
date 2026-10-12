import { useMemo, useState } from 'react';
import IconBox from '../../components/ui/IconBox';
import { getFinanceErrorMessage } from '../../pages/financeiro/financeUiUtils.js';
import { notifyFinancialDataChanged } from '../../services/financialDataEvents.js';
import { cx } from '../../utils/cx.js';
import { formatCurrency } from '../../utils/formatters.js';
import { PhPlusIcon } from '../simplified-app/SimplifiedIcons.jsx';
import SimplifiedSubpageHeader from '../simplified-app/SimplifiedSubpageHeader.jsx';
import { useNavegar } from '../simplified-app/movimentoDeTelaContext.js';
import { SIMPLIFIED_ROUTES, contaPath } from '../simplified-app/simplifiedRoutes.js';
import organizar from '../categories/organizar.module.css';
import { ContaIcon } from './ContaIcon.jsx';
import NovaContaModal from './NovaContaModal.jsx';
import { montarListaDeContas } from './contasOrganizar.js';
import { useContasOrganizar } from './useContasOrganizar.js';
import styles from './contas.module.css';

function plural(quantidade, singular, pluralForma) {
  return `${quantidade} ${quantidade === 1 ? singular : pluralForma}`;
}

// Lista de contas (handoff 10g): saldo total, uma linha por conta com tipo e
// saldo. Cartões de crédito ficam num grupo à parte; a #183 troca esse grupo
// pela lista de cartões com fatura e limite.
export default function ContasListaPage() {
  const navigate = useNavegar();
  const { accountState, balanceState, podeCriar, carregandoPapel, carregando } = useContasOrganizar();
  const [criando, setCriando] = useState(false);

  const lista = useMemo(() => montarListaDeContas({
    accounts: accountState.accounts,
    balances: balanceState.accountBalances,
  }), [accountState.accounts, balanceState.accountBalances]);

  const vazio = !carregando && lista.contas.length === 0 && lista.cartoes.length === 0;

  async function handleCriar(values) {
    const resultado = await accountState.saveAccount(values);
    if (!resultado.error) {
      notifyFinancialDataChanged('organizar-contas');
      await balanceState.refresh();
      setCriando(false);
    }
  }

  function renderLinha(conta) {
    return (
      <button
        key={conta.id}
        type="button"
        className={organizar.row}
        onClick={() => navigate(contaPath(conta.id))}
      >
        <IconBox><ContaIcon conta={conta} /></IconBox>
        <span className={organizar.rowText}>
          <span className={organizar.rowTitle}>{conta.name}</span>
          <span className={organizar.rowHint}>
            {[conta.tipoRotulo, conta.openFinance ? 'Open Finance' : null].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className={cx(organizar.rowValue, conta.saldo < 0 && styles.negativo)}>
          {formatCurrency(conta.saldo)}
        </span>
      </button>
    );
  }

  return (
    <div className={organizar.page}>
      <SimplifiedSubpageHeader title="Contas" onBack={() => navigate(SIMPLIFIED_ROUTES.ORGANIZAR)} />
      <div className={organizar.body}>
        {carregando ? (
          <p className={organizar.state} role="status">Carregando contas...</p>
        ) : accountState.error ? (
          <p className={organizar.state} role="alert">Não foi possível carregar as contas. Tente de novo em instantes.</p>
        ) : vazio ? (
          <p className={organizar.state}>
            {podeCriar || carregandoPapel
              ? 'Você ainda não tem contas. Toque em + para criar a primeira.'
              : 'Este espaço ainda não tem contas. Só o administrador do espaço pode criar.'}
          </p>
        ) : (
          <>
            <div className={organizar.summary}>
              <span className={organizar.summaryLabel}>Saldo total</span>
              <span className={cx(organizar.summaryValue, lista.total < 0 && styles.negativo)}>
                {formatCurrency(lista.total)}
              </span>
              <span className={organizar.summaryLabel}>
                {lista.contas.length > 0
                  ? `Em ${plural(lista.contas.length, 'conta', 'contas')}`
                  : 'Nenhuma conta além dos cartões'}
              </span>
            </div>
            {lista.contas.length > 0 ? <div>{lista.contas.map(renderLinha)}</div> : null}
            {lista.cartoes.length > 0 ? (
              <>
                <h2 className={organizar.sectionTitle}>Cartões de crédito</h2>
                <div>{lista.cartoes.map(renderLinha)}</div>
              </>
            ) : null}
          </>
        )}
      </div>

      <button
        type="button"
        className={organizar.fab}
        aria-label="Nova conta"
        onClick={() => setCriando(true)}
        disabled={!podeCriar}
      >
        <PhPlusIcon />
      </button>

      <NovaContaModal
        open={criando}
        onClose={() => {
          accountState.clearError();
          setCriando(false);
        }}
        onSave={handleCriar}
        isMutating={accountState.isMutating}
        serverError={criando
          ? getFinanceErrorMessage(accountState.error, 'Não foi possível salvar a conta. Tente novamente.')
          : ''}
      />
    </div>
  );
}
