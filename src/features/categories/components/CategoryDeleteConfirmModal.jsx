import { useEffect, useState } from 'react';
import Button from '../../../components/ui/Button';
import Field from '../../../components/ui/Field';
import Modal from '../../../components/ui/Modal';
import {
  CATEGORY_TYPES,
  categoriasDestinoParaMover,
  getCategoryErrorMessage,
  lancamentosQueBloqueiam,
} from '../categoryUtils.js';

const FALLBACK_ERRO = 'Não foi possível excluir a categoria. Tente novamente.';

/**
 * Confirmação de exclusão de categoria. O pai monta este modal só enquanto há
 * uma categoria pendente, então fechar sempre desmonta (mesma técnica de
 * ClientDeleteConfirmModal.jsx).
 *
 * Dois passos. Ao abrir, `contarLancamentos` diz se a categoria tem
 * lançamentos: sem nenhum, o primeiro passo confirma a exclusão; com algum, o
 * modal já abre no segundo, em que a pessoa escolhe a categoria do mesmo tipo
 * que recebe os lançamentos e `onMover` conclui a exclusão. O serviço
 * continua recusando com CATEGORY_HAS_DEPENDENCIES, e esse erro também leva
 * ao segundo passo. Sem categoria elegível, oferece criar uma
 * (`onCriarCategoria`).
 */
function CategoryDeleteConfirmModal({
  category,
  categories = [],
  isMutating,
  error,
  contarLancamentos,
  onConfirm,
  onMover,
  onCriarCategoria,
  onClose,
}) {
  const [destinoId, setDestinoId] = useState('');
  const [contando, setContando] = useState(Boolean(contarLancamentos));
  // Uma vez no passo de mover, o modal fica nele: um erro do passo 2 troca o
  // código do erro e não pode devolver a pessoa ao passo 1.
  const [lancamentos, setLancamentos] = useState(0);
  const bloqueio = lancamentosQueBloqueiam(error);
  if (bloqueio > 0 && bloqueio !== lancamentos) {
    setLancamentos(bloqueio);
  }

  useEffect(() => {
    if (!contarLancamentos) return undefined;
    let ativo = true;
    contarLancamentos(category.id)
      .then((total) => {
        if (!ativo) return;
        if (Number(total) > 0) setLancamentos(Number(total));
      })
      .catch(() => {})
      .finally(() => {
        if (ativo) setContando(false);
      });
    return () => {
      ativo = false;
    };
  }, [category.id, contarLancamentos]);

  const precisaMover = lancamentos > 0;
  const destinos = precisaMover ? categoriasDestinoParaMover(categories, category) : [];
  const serverError = bloqueio > 0 ? '' : getCategoryErrorMessage(error, FALLBACK_ERRO);
  const tipo = category.category_type === CATEGORY_TYPES.INCOME ? 'entrada' : 'saída';
  const plural = lancamentos === 1 ? '1 lançamento' : `${lancamentos} lançamentos`;

  function handleClose() {
    if (isMutating) return;
    onClose?.();
  }

  async function handleConfirm() {
    if (isMutating) return;
    await onConfirm?.();
  }

  async function handleMover() {
    if (isMutating || !destinoId) return;
    await onMover?.(destinoId);
  }

  const description = precisaMover
    ? `"${category.name}" tem ${plural}. Escolha a categoria que vai recebê-los. O orçamento desta categoria também sai. Esta ação não pode ser desfeita.`
    : `Excluir "${category.name}"? O orçamento desta categoria também sai. Esta ação não pode ser desfeita.`;

  const semDestino = onCriarCategoria
    ? `Não há outra categoria de ${tipo} para receber os lançamentos. Crie uma categoria de ${tipo} e tente de novo.`
    : `Não há outra categoria de ${tipo} para receber os lançamentos. Peça a quem administra o espaço para criar uma categoria de ${tipo}.`;

  return (
    <Modal
      open
      onClose={handleClose}
      closeOnOverlayClick={!isMutating}
      closeOnEsc={!isMutating}
      title="Excluir categoria"
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={isMutating}>
            Cancelar
          </Button>
          {!precisaMover ? (
            <Button
              variant="danger"
              loading={isMutating || contando}
              disabled={isMutating || contando}
              onClick={handleConfirm}
            >
              Excluir categoria
            </Button>
          ) : destinos.length > 0 ? (
            <Button
              variant="danger"
              loading={isMutating}
              disabled={isMutating || !destinoId}
              onClick={handleMover}
            >
              Mover e excluir
            </Button>
          ) : onCriarCategoria ? (
            <Button onClick={onCriarCategoria} disabled={isMutating}>
              Criar categoria
            </Button>
          ) : null}
        </>
      }
    >
      {precisaMover ? (
        destinos.length > 0 ? (
          <Field label="Categoria que recebe os lançamentos">
            <select
              value={destinoId}
              onChange={(event) => setDestinoId(event.target.value)}
              disabled={isMutating}
            >
              <option value="">Escolha uma categoria</option>
              {destinos.map((destino) => (
                <option key={destino.id} value={destino.id}>
                  {destino.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <p className="uf-text-caption">{semDestino}</p>
        )
      ) : null}

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
