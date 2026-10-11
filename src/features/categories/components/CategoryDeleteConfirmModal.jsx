import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';

/**
 * Confirmação de exclusão de categoria. O pai monta este modal só enquanto há
 * uma categoria pendente, então fechar sempre desmonta (mesma técnica de
 * ClientDeleteConfirmModal.jsx). Categoria com lançamentos é barrada pelo
 * deleteCategory e o motivo chega em `serverError`.
 */
function CategoryDeleteConfirmModal({ category, isMutating, serverError, onConfirm, onClose }) {
  function handleClose() {
    if (isMutating) return;
    onClose?.();
  }

  async function handleConfirm() {
    if (isMutating) return;
    await onConfirm?.();
  }

  return (
    <Modal
      open
      onClose={handleClose}
      closeOnOverlayClick={!isMutating}
      closeOnEsc={!isMutating}
      title="Excluir categoria"
      description={`Excluir "${category.name}"? O orçamento desta categoria também sai. Esta ação não pode ser desfeita.`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={isMutating}>
            Cancelar
          </Button>
          <Button variant="danger" loading={isMutating} disabled={isMutating} onClick={handleConfirm}>
            Excluir categoria
          </Button>
        </>
      }
    >
      {serverError ? (
        <p
          className="uf-p-md uf-rounded-md uf-bg-danger-subtle uf-text-danger uf-text-caption"
          role="alert"
        >
          {serverError}
        </p>
      ) : null}
    </Modal>
  );
}

export default CategoryDeleteConfirmModal;
