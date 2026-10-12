import { useMemo, useState } from 'react';
import IconBox from '../../components/ui/IconBox';
import ProgressBar from '../../components/ui/ProgressBar';
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
import NovoCartaoModal from './NovoCartaoModal.jsx';
import { formatarDiaCurto, montarListaDeCartoes, montarListaDeContas } from './contasOrganizar.js';
import { useContasOrganizar } from './useContasOrganizar.js';
import styles from './contas.module.css';

function plural(quantidade, singular, pluralForma) {
  return `${quantidade} ${quantidade === 1 ? singular : pluralForma}`;
}

// Lista de contas (handoff 10g) e de cartões (10j): saldo total, uma linha
// por conta com tipo e saldo; uma linha por cartão com fatura aberta, limite
// usado e as datas de fechamento e vencimento.
export default function ContasListaPage() {
  const navigate = useNavegar();
  const {
    mes, accountState, balanceState, cartoesState, carregandoCartoes, erroCartoes,
    podeCriar, carregandoPapel, carregando,
  } = useContasOrganizar({ comCartoes: true });
  // 'conta' | 'cartao' | null
  const [criando, setCriando] = useState(null);

  const lista = useMemo(() => montarListaDeContas({
    accounts: accountState.accounts,
    balances: balanceState.accountBalances,
  }), [accountState.accounts, balanceState.accountBalances]);

  const cartoes = useMemo(() => montarListaDeCartoes({
    cartoes: lista.cartoes,
    transactions: cartoesState.transactions,
    hoje: mes.date,
  }), [lista.cartoes, cartoesState.transactions, mes.date]);

  const vazio = !carregando && lista.contas.length === 0 && lista.cartoes.length === 0;

  async function handleCriar(values) {
    const resultado = await accountState.saveAccount(values);
    if (!resultado.error) {
      notifyFinancialDataChanged('organizar-contas');
      await balanceState.refresh();
      setCriando(null);
    }
  }

  // Um erro de carga ou de mutação anterior não é da folha: limpa ao abrir e ao fechar.
  function abrirFolha(tipo) {
    accountState.clearError();
    setCriando(tipo);
  }

  function fecharFolha() {
    accountState.clearError();
    setCriando(null);
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

  function renderCartao(cartao) {
    const datas = [
      cartao.closing_day ? `Fecha ${formatarDiaCurto(cartao.ciclo.fechamento)}` : null,
      cartao.ciclo.vencimento ? `Vence ${formatarDiaCurto(cartao.ciclo.vencimento)}` : null,
      cartao.openFinance ? 'Open Finance' : null,
    ].filter(Boolean);
    return (
      <button
        key={cartao.id}
        type="button"
        className={organizar.row}
        onClick={() => navigate(contaPath(cartao.id))}
      >
        <IconBox><ContaIcon conta={cartao} /></IconBox>
        <span className={organizar.rowText}>
          <span className={organizar.rowTitle}>{cartao.name}</span>
          <span className={organizar.rowHint}>{datas.length > 0 ? datas.join(' · ') : 'Sem datas da fatura'}</span>
        </span>
        <span className={organizar.rowValue}>
          {carregandoCartoes ? '...' : formatCurrency(cartao.fatura)}
        </span>
        <span className={styles.limite}>
          {cartao.limite.percentual === null ? (
            <span className={styles.limiteTexto}>Sem limite cadastrado</span>
          ) : (
            <>
              <ProgressBar value={cartao.limite.percentual} label={`Limite usado de ${cartao.name}`} />
              <span className={cx(styles.limiteTexto, cartao.limite.disponivel < 0 && styles.negativo)}>
                {`${formatCurrency(cartao.limite.usado)} de ${formatCurrency(cartao.limite.limite)} usados`}
              </span>
            </>
          )}
        </span>
      </button>
    );
  }

  const botaoNovoCartao = podeCriar ? (
    <button type="button" className={organizar.moreButton} onClick={() => abrirFolha('cartao')}>
      <span>Novo cartão</span>
      <PhPlusIcon />
    </button>
  ) : null;

  return (
    <div className={organizar.page}>
      <SimplifiedSubpageHeader title="Contas" onBack={() => navigate(SIMPLIFIED_ROUTES.ORGANIZAR)} />
      <div className={organizar.body}>
        {carregando ? (
          <p className={organizar.state} role="status">Carregando contas...</p>
        ) : accountState.error ? (
          <p className={organizar.state} role="alert">Não foi possível carregar as contas. Tente de novo em instantes.</p>
        ) : vazio ? (
          <>
            <p className={organizar.state}>
              {podeCriar || carregandoPapel
                ? 'Você ainda não tem contas. Toque em + para criar a primeira.'
                : 'Este espaço ainda não tem contas. Só o administrador do espaço pode criar.'}
            </p>
            {botaoNovoCartao}
          </>
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
            <h2 className={organizar.sectionTitle}>Cartões de crédito</h2>
            {cartoes.length > 0 ? (
              <div>{cartoes.map(renderCartao)}</div>
            ) : (
              <p className={organizar.lead}>
                {podeCriar
                  ? 'Cadastre um cartão para acompanhar a fatura aberta e o limite usado.'
                  : 'Nenhum cartão cadastrado.'}
              </p>
            )}
            {erroCartoes ? (
              <p className={organizar.note} role="alert">Não foi possível carregar a fatura dos cartões.</p>
            ) : null}
            {botaoNovoCartao}
          </>
        )}
      </div>

      <button
        type="button"
        className={organizar.fab}
        aria-label="Nova conta"
        onClick={() => abrirFolha('conta')}
        disabled={!podeCriar}
      >
        <PhPlusIcon />
      </button>

      <NovaContaModal
        open={criando === 'conta'}
        onClose={fecharFolha}
        onSave={handleCriar}
        isMutating={accountState.isMutating}
        serverError={criando === 'conta'
          ? getFinanceErrorMessage(accountState.error, 'Não foi possível salvar a conta. Tente novamente.')
          : ''}
      />

      <NovoCartaoModal
        open={criando === 'cartao'}
        onClose={fecharFolha}
        onSave={handleCriar}
        isMutating={accountState.isMutating}
        serverError={criando === 'cartao'
          ? getFinanceErrorMessage(accountState.error, 'Não foi possível salvar o cartão. Tente novamente.')
          : ''}
      />
    </div>
  );
}
