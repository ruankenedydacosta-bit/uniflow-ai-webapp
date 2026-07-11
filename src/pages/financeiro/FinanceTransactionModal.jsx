import { useMemo, useState } from 'react';
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

function createEmptyForm() {
  return {
    account_id: '',
    destination_account_id: '',
    category_id: '',
    transaction_type: 'expense',
    description: '',
    amount: '',
    transaction_date: new Date().toISOString().slice(0, 10),
  };
}

function FinanceTransactionModal({ accountState, categoryState, onClose, open, transactionState }) {
  const [form, setForm] = useState(createEmptyForm);
  const [editingId, setEditingId] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const filteredCategories = useMemo(
    () =>
      categoryState.categories.filter((category) =>
        form.transaction_type === 'adjustment'
          ? category.category_type !== 'transfer'
          : category.category_type === form.transaction_type,
      ),
    [categoryState.categories, form.transaction_type],
  );

  function resetForm() {
    setForm(createEmptyForm());
    setEditingId(null);
    setPendingDeleteId(null);
  }

  function handleClose() {
    transactionState.clearError();
    resetForm();
    onClose();
  }

  function handleEdit(transaction) {
    transactionState.clearError();
    setEditingId(transaction.id);
    setPendingDeleteId(null);
    setForm({
      account_id: transaction.account_id,
      destination_account_id: transaction.destination_account_id ?? '',
      category_id: transaction.category_id ?? '',
      transaction_type: transaction.transaction_type,
      description: transaction.description,
      amount: String(transaction.amount),
      transaction_date: transaction.transaction_date,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const result = await transactionState.saveTransaction(
      {
        account_id: form.account_id,
        destination_account_id:
          form.transaction_type === 'transfer' ? form.destination_account_id : null,
        category_id: form.category_id || null,
        transaction_type: form.transaction_type,
        description: form.description,
        amount: form.amount,
        transaction_date: form.transaction_date,
        status: 'completed',
      },
      editingId,
    );

    if (!result.error) resetForm();
  }

  async function handleDelete(transactionId) {
    const result = await transactionState.removeTransaction(transactionId);
    if (!result.error) resetForm();
  }

  const canSubmit =
    form.account_id &&
    form.description.trim() &&
    Number(form.amount) > 0 &&
    form.transaction_date &&
    (form.transaction_type !== 'transfer' || form.destination_account_id);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Lançamentos"
      description="Registre entradas, despesas, transferências e ajustes deste espaço."
      size="xl"
      footer={
        <Button variant="ghost" onClick={handleClose}>
          Fechar
        </Button>
      }
    >
      <div className="uf-flex uf-flex-column uf-gap-lg">
        <form className="uf-flex uf-flex-column uf-gap-md" onSubmit={handleSubmit}>
          <SelectField
            id="finance-transaction-type"
            label="Tipo"
            value={form.transaction_type}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                transaction_type: event.target.value,
                category_id: '',
                destination_account_id: '',
              }))
            }
          >
            <option value="income">Entrada</option>
            <option value="expense">Despesa</option>
            <option value="transfer">Transferência</option>
            <option value="adjustment">Ajuste</option>
          </SelectField>
          <SelectField
            id="finance-transaction-account"
            label="Conta"
            value={form.account_id}
            onChange={(event) =>
              setForm((current) => ({ ...current, account_id: event.target.value }))
            }
            required
          >
            <option value="">Selecione uma conta</option>
            {accountState.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </SelectField>
          {form.transaction_type === 'transfer' ? (
            <SelectField
              id="finance-transaction-destination"
              label="Conta de destino"
              value={form.destination_account_id}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  destination_account_id: event.target.value,
                }))
              }
              required
            >
              <option value="">Selecione a conta de destino</option>
              {accountState.accounts
                .filter((account) => account.id !== form.account_id)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
            </SelectField>
          ) : null}
          <SelectField
            id="finance-transaction-category"
            label="Categoria"
            value={form.category_id}
            onChange={(event) =>
              setForm((current) => ({ ...current, category_id: event.target.value }))
            }
          >
            <option value="">Sem categoria</option>
            {filteredCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectField>
          <Input
            id="finance-transaction-description"
            label="Descrição"
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
            required
            fullWidth
          />
          <Input
            id="finance-transaction-amount"
            label="Valor"
            type="number"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={(event) =>
              setForm((current) => ({ ...current, amount: event.target.value }))
            }
            required
            fullWidth
          />
          <Input
            id="finance-transaction-date"
            label="Data"
            type="date"
            value={form.transaction_date}
            onChange={(event) =>
              setForm((current) => ({ ...current, transaction_date: event.target.value }))
            }
            required
            fullWidth
          />
          {!accountState.accounts.length ? (
            <FormMessage tone="info">Crie uma conta antes do primeiro lançamento.</FormMessage>
          ) : null}
          <FormMessage>
            {getFinanceErrorMessage(
              transactionState.error,
              'Não foi possível concluir o lançamento. Revise os dados e tente novamente.',
            )}
          </FormMessage>
          <div className="uf-flex uf-items-center uf-justify-end uf-gap-sm uf-flex-wrap">
            {editingId ? (
              <Button variant="ghost" onClick={resetForm}>
                Cancelar edição
              </Button>
            ) : null}
            <Button type="submit" loading={transactionState.isMutating} disabled={!canSubmit}>
              {editingId ? 'Salvar lançamento' : 'Criar lançamento'}
            </Button>
          </div>
        </form>

        <div className="uf-flex uf-flex-column uf-gap-sm">
          {transactionState.transactions.map((transaction) => (
            <CrudRow
              key={transaction.id}
              title={transaction.description}
              detail={`${transaction.transaction_date} · ${formatCurrency(transaction.amount)}`}
            >
              <Button
                variant="outline"
                size="sm"
                disabled={transactionState.isMutating}
                onClick={() => handleEdit(transaction)}
              >
                Editar
              </Button>
              <DeleteActions
                isConfirming={pendingDeleteId === transaction.id}
                isLoading={transactionState.isMutating}
                onRequest={() => setPendingDeleteId(transaction.id)}
                onCancel={() => setPendingDeleteId(null)}
                onConfirm={() => handleDelete(transaction.id)}
              />
            </CrudRow>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export default FinanceTransactionModal;
