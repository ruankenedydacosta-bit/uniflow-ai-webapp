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
  expense: 'Saída',
  transfer: 'Transferência',
};

const MANAGE_BLOCKED_TITLE = 'Você não possui permissão para gerenciar categorias deste espaço.';
const DELETE_BLOCKED_TITLE = 'Você não possui permissão para excluir esta categoria.';

function FinanceCategoryModal({
  canDeleteCategory = () => true,
  canManage = true,
  categoryState,
  onChanged,
  onClose,
  open,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setPendingDeleteId(null);
  }

  function handleClose() {
    if (categoryState.isMutating) return;
    categoryState.clearError();
    resetForm();
    onClose();
  }

  function handleEdit(category) {
    if (categoryState.isMutating || !canManage) return;
    categoryState.clearError();
    setEditingId(category.id);
    setPendingDeleteId(null);
    setForm({ name: category.name, category_type: category.category_type });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (categoryState.isMutating || !canManage) return;
    const result = await categoryState.saveCategory(form, editingId);
    if (!result.error) {
      await onChanged?.();
      resetForm();
    }
  }

  async function handleDelete(categoryId) {
    if (categoryState.isMutating) return;
    const category = categoryState.categories.find((item) => item.id === categoryId);
    if (!category || !canDeleteCategory(category)) return;
    const result = await categoryState.removeCategory(categoryId);
    if (!result.error) {
      await onChanged?.();
      resetForm();
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeOnOverlayClick={!categoryState.isMutating}
      closeOnEsc={!categoryState.isMutating}
      title="Categorias"
      description="Use o catálogo global ou crie categorias próprias para este espaço."
      size="lg"
      footer={
        <Button variant="ghost" onClick={handleClose} disabled={categoryState.isMutating}>
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
            <option value="expense">Saída</option>
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
              <Button variant="ghost" onClick={resetForm} disabled={categoryState.isMutating}>
                Cancelar edição
              </Button>
            ) : null}
            <Button
              type="submit"
              loading={categoryState.isMutating}
              disabled={!canManage || categoryState.isMutating || !form.name.trim()}
              title={!canManage ? MANAGE_BLOCKED_TITLE : undefined}
            >
              {editingId ? 'Salvar categoria' : 'Criar categoria'}
            </Button>
          </div>
        </form>

        <div className="uf-flex uf-flex-column uf-gap-sm">
          {categoryState.categories.map((category) => {
            const canDeleteThisCategory = canDeleteCategory(category);
            return (
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
                      disabled={categoryState.isMutating || !canManage}
                      title={!canManage ? MANAGE_BLOCKED_TITLE : undefined}
                      onClick={() => handleEdit(category)}
                    >
                      Editar
                    </Button>
                    {canDeleteThisCategory ? (
                      <DeleteActions
                        isConfirming={pendingDeleteId === category.id}
                        isLoading={categoryState.isMutating}
                        onRequest={() => setPendingDeleteId(category.id)}
                        onCancel={() => setPendingDeleteId(null)}
                        onConfirm={() => handleDelete(category.id)}
                      />
                    ) : (
                      <Button variant="ghost" size="sm" disabled title={DELETE_BLOCKED_TITLE}>
                        Excluir
                      </Button>
                    )}
                  </>
                ) : null}
              </CrudRow>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

export default FinanceCategoryModal;
