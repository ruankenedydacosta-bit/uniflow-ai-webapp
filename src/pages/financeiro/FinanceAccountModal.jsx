import { useState } from 'react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { formatCurrency } from '../../utils/formatters';
import {
  CrudRow,
  DeleteActions,
  FormMessage,
} from './FinanceCrudPrimitives';
import { getFinanceErrorMessage } from './financeUiUtils';
import styles from './FinanceAccountModal.module.css';

const EMPTY_FORM = {
  name: '',
  account_type: 'checking',
  balance: '0',
};

function FinanceAccountModal({ accountState, onChanged, onClose, open }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const isFirstAccount = accountState.activeAccounts.length === 0;

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setPendingDeleteId(null);
  }

  function handleClose() {
    accountState.clearError();
    resetForm();
    onClose();
  }

  function handleEdit(account) {
    accountState.clearError();
    setEditingId(account.id);
    setPendingDeleteId(null);
    setForm({
      name: account.name,
      account_type: account.account_type,
      balance: String(account.initial_balance ?? 0),
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const balance = form.balance || '0';
    const result = await accountState.saveAccount(
      {
        name: form.name,
        account_type: form.account_type,
        initial_balance: balance,
      },
      editingId,
    );

    if (!result.error) {
      await onChanged?.();
      resetForm();
    }
  }

  async function handleDelete(accountId) {
    const result = await accountState.archiveAccount(accountId);
    if (!result.error) {
      await onChanged?.();
      resetForm();
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isFirstAccount ? 'Crie sua primeira conta' : 'Contas'}
      description={isFirstAccount
        ? 'Comece por aqui para organizar os dados deste perfil.'
        : 'Organize as fontes usadas nos lançamentos deste perfil.'}
      size="md"
      className={styles.accountDialog}
    >
      <div className={styles.accountContent}>
        <form className={styles.accountForm} onSubmit={handleSubmit}>
          <Input
            id="finance-account-name"
            label="Nome da conta"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            required
            fullWidth
          />
          <label className={styles.typeField} htmlFor="finance-account-type">
            <span>Tipo de conta</span>
            <select
              id="finance-account-type"
              className={styles.typeSelect}
              value={form.account_type}
              onChange={(event) =>
                setForm((current) => ({ ...current, account_type: event.target.value }))
              }
            >
              {accountState.accountTypes.map((type) => (
                <option key={type.code} value={type.code}>
                  {type.name}
                </option>
              ))}
            </select>
            <small>Escolha a opção que melhor representa esta conta.</small>
          </label>
          <Input
            id="finance-account-balance"
            label="Saldo inicial"
            helperText="Informe quanto havia na conta antes do primeiro lançamento."
            type="number"
            step="0.01"
            value={form.balance}
            onChange={(event) =>
              setForm((current) => ({ ...current, balance: event.target.value }))
            }
            fullWidth
          />
          <FormMessage>
            {getFinanceErrorMessage(
              accountState.error,
              'Não foi possível concluir a ação com esta conta. Tente novamente.',
            )}
          </FormMessage>
          <div className={styles.accountActions}>
            {editingId ? (
              <Button variant="ghost" onClick={resetForm}>
                Cancelar edição
              </Button>
            ) : null}
            <Button type="submit" loading={accountState.isMutating} disabled={!form.name.trim()}>
              {editingId ? 'Salvar conta' : isFirstAccount ? 'Criar primeira conta' : 'Criar conta'}
            </Button>
          </div>
        </form>

        <div className={styles.accountList}>
          {accountState.activeAccounts.map((account) => (
            <CrudRow
              key={account.id}
              title={account.name}
              detail={`${account.account_type} · ${formatCurrency(account.derived_balance ?? account.initial_balance ?? 0)}`}
            >
              <Button
                variant="outline"
                size="sm"
                disabled={accountState.isMutating}
                onClick={() => handleEdit(account)}
              >
                Editar
              </Button>
              <DeleteActions
                actionLabel="Arquivar"
                confirmLabel="Confirmar arquivo"
                isConfirming={pendingDeleteId === account.id}
                isLoading={accountState.isMutating}
                onRequest={() => setPendingDeleteId(account.id)}
                onCancel={() => setPendingDeleteId(null)}
                onConfirm={() => handleDelete(account.id)}
              />
            </CrudRow>
          ))}
          {!accountState.activeAccounts.length ? (
            <p className={styles.emptyGuidance} role="status">
              Cadastre uma conta para começar a acompanhar seu dinheiro neste perfil.
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

export default FinanceAccountModal;
