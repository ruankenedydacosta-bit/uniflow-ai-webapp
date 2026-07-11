import { useState } from 'react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import {
  CrudRow,
  DeleteActions,
  FormMessage,
  SelectField,
} from './FinanceCrudPrimitives';
import { getFinanceErrorMessage } from './financeUiUtils';

const EMPTY_FORM = { name: '', category_type: 'expense' };
const CATEGORY_LABELS = {
  income: 'Entrada',
  expense: 'Despesa',
  transfer: 'Transferência',
};

function FinanceCategoryModal({ categoryState, onClose, open }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setPendingDeleteId(null);
  }

  function handleClose() {
    categoryState.clearError();
    resetForm();
    onClose();
  }

  function handleEdit(category) {
    categoryState.clearError();
    setEditingId(category.id);
    setPendingDeleteId(null);
    setForm({ name: category.name, category_type: category.category_type });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const result = await categoryState.saveCategory(form, editingId);
    if (!result.error) resetForm();
  }

  async function handleDelete(categoryId) {
    const result = await categoryState.removeCategory(categoryId);
    if (!result.error) resetForm();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Categorias"
      description="Use o catálogo global ou crie categorias próprias para este espaço."
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
            id="finance-category-name"
            label="Nome da categoria"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            required
            fullWidth
          />
          <SelectField
            id="finance-category-type"
            label="Tipo"
            value={form.category_type}
            onChange={(event) =>
              setForm((current) => ({ ...current, category_type: event.target.value }))
            }
          >
            <option value="income">Entrada</option>
            <option value="expense">Despesa</option>
            <option value="transfer">Transferência</option>
          </SelectField>
          <FormMessage>
            {getFinanceErrorMessage(
              categoryState.error,
              'Não foi possível concluir a ação com esta categoria. Tente novamente.',
            )}
          </FormMessage>
          <div className="uf-flex uf-items-center uf-justify-end uf-gap-sm uf-flex-wrap">
            {editingId ? (
              <Button variant="ghost" onClick={resetForm}>
                Cancelar edição
              </Button>
            ) : null}
            <Button type="submit" loading={categoryState.isMutating} disabled={!form.name.trim()}>
              {editingId ? 'Salvar categoria' : 'Criar categoria'}
            </Button>
          </div>
        </form>

        <div className="uf-flex uf-flex-column uf-gap-sm">
          {categoryState.categories.map((category) => (
            <CrudRow
              key={category.id}
              title={category.name}
              detail={`${CATEGORY_LABELS[category.category_type] ?? category.category_type}${
                category.is_system ? ' · Catálogo UniFlow' : ' · Personalizada'
              }`}
            >
              {!category.is_system ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={categoryState.isMutating}
                    onClick={() => handleEdit(category)}
                  >
                    Editar
                  </Button>
                  <DeleteActions
                    isConfirming={pendingDeleteId === category.id}
                    isLoading={categoryState.isMutating}
                    onRequest={() => setPendingDeleteId(category.id)}
                    onCancel={() => setPendingDeleteId(null)}
                    onConfirm={() => handleDelete(category.id)}
                  />
                </>
              ) : null}
            </CrudRow>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export default FinanceCategoryModal;
