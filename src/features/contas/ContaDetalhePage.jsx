import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import Button from '../../components/ui/Button';
import IconBox from '../../components/ui/IconBox';
import Modal from '../../components/ui/Modal';
import OutlineButton from '../../components/ui/OutlineButton';
import { getFinanceErrorMessage } from '../../pages/financeiro/financeUiUtils.js';
import { notifyFinancialDataChanged } from '../../services/financialDataEvents.js';
import { cx } from '../../utils/cx.js';
import { formatCurrency } from '../../utils/formatters.js';
import SimplifiedSubpageHeader from '../simplified-app/SimplifiedSubpageHeader.jsx';
import UpdateBalanceModal from '../simplified-app/UpdateBalanceModal.jsx';
import { useNavegar } from '../simplified-app/movimentoDeTelaContext.js';
import { SIMPLIFIED_ROUTES } from '../simplified-app/simplifiedRoutes.js';
import organizar from '../categories/organizar.module.css';
import { ContaIcon } from './ContaIcon.jsx';
import NovaContaModal from './NovaContaModal.jsx';
import {
  ehCartao,
  ehContaDoOpenFinance,
  lancamentosDaConta,
  resumoDaConta,
  rotuloDoTipo,
  saldoDaConta,
  sinalDoLancamento,
} from './contasOrganizar.js';
import { useContasOrganizar } from './useContasOrganizar.js';
import styles from './contas.module.css';

function plural(quantidade, singular, pluralForma) {
  return `${quantidade} ${quantidade === 1 ? singular : pluralForma}`;
}

function formatarDia(data) {
  const [, mes, dia] = String(data).split('-');
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${Number(dia)} ${meses[Number(mes) - 1] ?? ''}`.trim();
}

const DESCRICAO_PADRAO = Object.freeze({
  income: 'Entrada',
  expense: 'Saída',
  transfer: 'Transferência',
  adjustment: 'Ajuste de saldo',
});

// Detalhe da conta (handoff 10h): saldo, movimento do mês, lançamentos e as
// ações. Conta do Open Finance não edita, não ajusta saldo nem exclui; a
// nota abaixo das ações explica.
export default function ContaDetalhePage() {
  const { id } = useParams();
  const navigate = useNavegar();
  const {
    mes, accountState, balanceState, transactionState, permissoes, carregandoPapel, carregando,
  } = useContasOrganizar({ comLancamentos: true });
  const [editando, setEditando] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const [ajustando, setAjustando] = useState(false);

  const conta = accountState.accounts.find((c) => c.id === id && c.is_active !== false) ?? null;
  const saldo = conta ? saldoDaConta(conta, balanceState.accountBalances) : 0;
  const lancamentos = useMemo(
    () => lancamentosDaConta(transactionState.transactions, id),
    [transactionState.transactions, id],
  );
  const resumo = useMemo(
    () => resumoDaConta(transactionState.transactions, id),
    [transactionState.transactions, id],
  );
  const pode = permissoes(conta);
  const voltar = () => navigate(SIMPLIFIED_ROUTES.CONTAS);
  const mesRotulo = mes.label.split(' de ')[0].replace(/^./, (letra) => letra.toUpperCase());

  async function handleEditar(values) {
    const resultado = await accountState.saveAccount(values, editando.id);
    if (!resultado.error) {
      notifyFinancialDataChanged('organizar-contas');
      setEditando(null);
    }
  }

  async function handleExcluir() {
    const resultado = await accountState.removeAccount(excluindo.id);
    if (!resultado.error) {
      notifyFinancialDataChanged('organizar-contas');
      setExcluindo(null);
      voltar();
    }
  }

  // Conta com lançamentos não pode ser excluída (o histórico ficaria sem
  // conta). Arquivar tira a conta da lista e guarda os lançamentos.
  async function handleArquivar() {
    const resultado = await accountState.archiveAccount(excluindo.id);
    if (!resultado.error) {
      notifyFinancialDataChanged('organizar-contas');
      setExcluindo(null);
      voltar();
    }
  }

  // O ajuste de saldo já avisa pelo evento financeiro
  // ('confirmed-financial-action'), e o hook recarrega ao ouvi-lo.

  if (carregando && !conta) {
    return (
      <div className={organizar.page}>
        <SimplifiedSubpageHeader title="Conta" onBack={voltar} />
        <p className={organizar.state} role="status">Carregando conta...</p>
      </div>
    );
  }

  if (!conta) {
    return (
      <div className={organizar.page}>
        <SimplifiedSubpageHeader title="Conta" onBack={voltar} />
        <p className={organizar.state}>Esta conta não existe mais. Volte para a lista.</p>
      </div>
    );
  }

  const openFinance = ehContaDoOpenFinance(conta);
  // A exclusão foi barrada pelo serviço: a conta tem lançamentos (de qualquer
  // mês), e o caminho vira arquivar.
  const temLancamentos = accountState.error?.code === 'ACCOUNT_HAS_DEPENDENCIES';
  const movimento = resumo.entradas - resumo.saidas;

  return (
    <div className={organizar.page}>
      <SimplifiedSubpageHeader title={conta.name} onBack={voltar} />
      <div className={organizar.body}>
        <div className={organizar.detailHead}>
          <IconBox size={44}><ContaIcon conta={conta} /></IconBox>
          <span className={organizar.detailTitle}>
            <span className={organizar.detailName}>{conta.name}</span>
            <span className={organizar.rowHint}>
              {[rotuloDoTipo(conta.account_type), openFinance ? 'Open Finance' : null].filter(Boolean).join(' · ')}
            </span>
          </span>
        </div>

        <div className={organizar.months}>
          <div className={organizar.monthCard}>
            <span className={organizar.summaryLabel}>{ehCartao(conta) ? 'Fatura aberta' : 'Saldo atual'}</span>
            <span className={cx(organizar.monthValue, saldo < 0 && styles.negativo)}>
              {balanceState.isLoading ? '...' : formatCurrency(saldo)}
            </span>
            <span className={organizar.rowHint}>{openFinance ? 'Atualizado pelo banco' : 'Pelos lançamentos'}</span>
          </div>
          <div className={organizar.monthCard}>
            <span className={organizar.summaryLabel}>{mesRotulo}</span>
            <span className={cx(organizar.monthValue, movimento < 0 && styles.negativo, movimento > 0 && styles.positivo)}>
              {transactionState.isLoading ? '...' : `${movimento > 0 ? '+' : ''}${formatCurrency(movimento)}`}
            </span>
            <span className={organizar.rowHint}>
              {transactionState.isLoading ? 'Carregando' : plural(resumo.quantidade, 'lançamento', 'lançamentos')}
            </span>
          </div>
        </div>

        <h2 className={organizar.sectionTitle}>Lançamentos</h2>
        {transactionState.isLoading ? (
          <p className={organizar.state} role="status">Carregando lançamentos...</p>
        ) : transactionState.error ? (
          <p className={organizar.state} role="alert">Não foi possível carregar os lançamentos.</p>
        ) : lancamentos.length === 0 ? (
          <p className={organizar.state}>Nenhum lançamento neste mês.</p>
        ) : (
          <div>
            {lancamentos.map((t) => {
              const sinal = sinalDoLancamento(t, conta.id);
              return (
                <div key={t.id} className={organizar.row}>
                  <span />
                  <span className={organizar.rowText}>
                    <span className={organizar.rowTitle}>{t.description || DESCRICAO_PADRAO[t.transaction_type] || 'Lançamento'}</span>
                    <span className={organizar.rowHint}>{formatarDia(t.transaction_date)}</span>
                  </span>
                  <span className={cx(organizar.rowValue, sinal < 0 && styles.negativo)}>
                    {sinal < 0 ? '-' : '+'}{formatCurrency(Math.abs(Number(t.amount || 0)))}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className={organizar.actions}>
          {pode.ajustarSaldo ? (
            <OutlineButton variant="secondary" disabled={accountState.isMutating} onClick={() => setAjustando(true)}>
              Ajustar saldo
            </OutlineButton>
          ) : null}
          {pode.editar ? (
            <OutlineButton
              variant="secondary"
              disabled={accountState.isMutating}
              onClick={() => {
                accountState.clearError();
                setEditando({ ...conta });
              }}
            >
              Editar conta
            </OutlineButton>
          ) : null}
          {pode.excluir ? (
            <OutlineButton
              variant="ghost"
              disabled={accountState.isMutating}
              onClick={() => {
                accountState.clearError();
                setExcluindo({ ...conta });
              }}
            >
              Excluir conta
            </OutlineButton>
          ) : null}
          {openFinance ? (
            <p className={organizar.note}>
              Esta conta vem do Open Finance. O banco atualiza o nome e o saldo, por isso ela não pode ser editada por aqui.
            </p>
          ) : !pode.editar && !carregandoPapel ? (
            <p className={organizar.note}>
              Só o administrador do espaço pode editar e excluir contas.
            </p>
          ) : null}
        </div>
      </div>

      <NovaContaModal
        open={Boolean(editando)}
        conta={editando}
        onClose={() => {
          accountState.clearError();
          setEditando(null);
        }}
        onSave={handleEditar}
        isMutating={accountState.isMutating}
        serverError={editando
          ? getFinanceErrorMessage(accountState.error, 'Não foi possível salvar a conta. Tente novamente.')
          : ''}
      />

      {ajustando ? (
        <UpdateBalanceModal
          open
          target="balance"
          accountId={conta.id}
          currentValue={saldo}
          onClose={() => setAjustando(false)}
        />
      ) : null}

      {excluindo ? (
        <Modal
          open
          onClose={() => {
            if (accountState.isMutating) return;
            accountState.clearError();
            setExcluindo(null);
          }}
          closeOnOverlayClick={!accountState.isMutating}
          closeOnEsc={!accountState.isMutating}
          title={temLancamentos ? 'Arquivar conta' : 'Excluir conta'}
          description={temLancamentos
            ? `"${excluindo.name}" tem lançamentos, por isso não pode ser excluída. Arquivar tira a conta da lista e mantém os lançamentos.`
            : `Excluir "${excluindo.name}"? Esta ação não pode ser desfeita.`}
          size="sm"
          footer={
            <>
              <Button
                variant="ghost"
                disabled={accountState.isMutating}
                onClick={() => {
                  accountState.clearError();
                  setExcluindo(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                loading={accountState.isMutating}
                disabled={accountState.isMutating}
                onClick={temLancamentos ? handleArquivar : handleExcluir}
              >
                {temLancamentos ? 'Arquivar conta' : 'Excluir conta'}
              </Button>
            </>
          }
        >
          {accountState.error && !temLancamentos ? (
            <p className={styles.formError} role="alert">
              {getFinanceErrorMessage(accountState.error, 'Não foi possível excluir a conta. Tente novamente.')}
            </p>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}
