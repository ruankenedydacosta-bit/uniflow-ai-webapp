import { useRef } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { getProjectErrorMessage } from './projectFormUtils.js';

/**
 * Confirmacao de exclusao de um projeto (Fase 13, Subfase 13.4). Exclusao
 * real (delete), sem lixeira/arquivamento nesta fase. Mesmo padrao
 * estrutural de AgendaDeleteConfirmModal.jsx/ClientDeleteConfirmModal.jsx.
 *
 * `onConfirm` decide fechar o modal (sucesso) ou mante-lo aberto com erro
 * (falha) atraves do componente pai -- este modal so exibe o `error`
 * externo recebido via prop.
 */
function ProjectDeleteConfirmModal({ isOpen, project, isDeleting = false, error = null, onClose, onConfirm }) {
  // Trava sincrona local, adicional ao isDeleting externo -- mesmo
  // raciocinio de ProjectFormModal.jsx.
  // Lido SOMENTE dentro dos handlers (nunca durante o render) -- ler
  // ref.current no corpo do componente e proibido (react-hooks/refs).
  const localMutationRef = useRef(false);

  function handleClose() {
    if (isDeleting || localMutationRef.current) return;
    onClose();
  }

  async function handleConfirm() {
    if (isDeleting || localMutationRef.current) return;

    localMutationRef.current = true;
    try {
      await onConfirm();
    } finally {
      localMutationRef.current = false;
    }
  }

  if (!project) return null;

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      closeOnOverlayClick={!isDeleting}
      closeOnEsc={!isDeleting}
      title="Excluir projeto"
      description={`Excluir "${project.name}"? Esta ação é permanente e não pode ser desfeita.`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={isDeleting}>
            Cancelar
          </Button>
          <Button variant="danger" loading={isDeleting} disabled={isDeleting} onClick={handleConfirm}>
            Excluir definitivamente
          </Button>
        </>
      }
    >
      {error ? (
        <p className="uf-p-md uf-rounded-md uf-bg-danger-subtle uf-text-danger uf-text-caption" role="alert">
          {getProjectErrorMessage(error, 'Não foi possível excluir o projeto. Tente novamente.')}
        </p>
      ) : null}
    </Modal>
  );
}

export default ProjectDeleteConfirmModal;
