import { useState } from 'react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { formatCurrency } from '../../utils/formatters';
import {
  CrudRow,
  DeleteActions,
  FormMessage,
  SelectField,
} from './FinanceCrudPrimitives';
import { getFinanceErrorMessage } from './financeUiUtils';

const EMPTY_FORM = {
  name: '',
  account_type: 'checking',
  balance: '0',
};

function FinanceAccountModal({ accountState, onClose, open }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

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
      balance: String(account.current_balance ?? 0),
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const balance = form.balance || '0';
    const result = await accountState.saveAccount(
      {
        name: form.name,
        account_type: form.account_type,
        ...(editingId
          ? { current_balance: balance }
          : { initial_balance: balance, current_balance: balance }),
      },
      editingId,
    );

    if (!result.error) resetForm();
  }

  async function handleDelete(accountId) {
    const result = await accountState.archiveAccount(accountId);
    if (!result.error) resetForm();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Contas"
      description="Organize as fontes usadas nos lançamentos deste espaço."
      size="lg"
      footer={
        <Button variant="ghost" onClick={handleClose}>
          Fechar
        </Button>
      }
    >
      <div className="uf-flex uf-flex-column uf-gap-lg">
        <form className="uf-flex uf-flex-column uf-gap-md" onSubmit={handleSubmit}>
          <Input
            id="finance-account-name"
            label="Nome da conta"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            required
            fullWidth
          />
          <SelectField
            id="finance-account-type"
            label="Tipo de conta"
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
          </SelectField>
          <Input
            id="finance-account-balance"
            label="Saldo atual"
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
          <div className="uf-flex uf-items-center uf-justify-end uf-gap-sm uf-flex-wrap">
            {editingId ? (
              <Button variant="ghost" onClick={resetForm}>
                Cancelar edição
              </Button>
            ) : null}
            <Button type="submit" loading={accountState.isMutating} disabled={!form.name.trim()}>
              {editingId ? 'Salvar conta' : 'Criar conta'}
            </Button>
          </div>
        </form>

        <div className="uf-flex uf-flex-column uf-gap-sm">
          {accountState.accounts.map((account) => (
            <CrudRow
              key={account.id}
              title={account.name}
              detail={`${account.account_type} · ${formatCurrency(account.current_balance)}`}
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
          {!accountState.accounts.length ? (
            <FormMessage tone="info">Nenhuma conta cadastrada neste espaço.</FormMessage>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

export default FinanceAccountModal;
