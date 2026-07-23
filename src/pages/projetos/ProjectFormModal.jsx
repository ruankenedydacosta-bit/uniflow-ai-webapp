import { useRef, useState } from 'react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import {
  PROJECT_PRIORITY_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  buildProjectPayload,
  getProjectEditValues,
  getProjectErrorMessage,
  getProjectInitialValues,
  validateProjectForm,
} from './projectFormUtils.js';

// Copia local e minima dos primitivos de formulario (mesmo padrao visual do
// resto do app, tokens uf-* globais). Deliberadamente nao compartilhado com
// outros dominios -- Projetos nao deve depender de Agenda/CRM/Clientes.
function SelectField({ id, label, children, ...props }) {
  return (
    <label className="uf-flex uf-flex-column uf-gap-sm uf-text-caption" htmlFor={id}>
      <span className="uf-text-primary">{label}</span>
      <select
        id={id}
        className="uf-w-full uf-p-md uf-rounded-md uf-border uf-bg-sunken uf-focus-ring"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

function TextareaField({ id, label, ...props }) {
  return (
    <label className="uf-flex uf-flex-column uf-gap-sm uf-text-caption" htmlFor={id}>
      <span className="uf-text-primary">{label}</span>
      <textarea
        id={id}
        className="uf-w-full uf-p-md uf-rounded-md uf-border uf-bg-sunken uf-focus-ring"
        rows={3}
        {...props}
      />
    </label>
  );
}

function FormMessage({ children, tone = 'danger' }) {
  if (!children) return null;

  return (
    <p
      className={`uf-p-md uf-rounded-md uf-bg-${tone}-subtle uf-text-${tone} uf-text-caption`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}

/**
 * Criacao e edicao de projetos (Fase 13, Subfase 13.4). Sem Responsavel no
 * formulario -- nao existe hoje infraestrutura segura para listar membros
 * ativos do workspace (ver comentario em projectFormUtils.js); assigned_user_id
 * continua no modelo/service para uso futuro.
 *
 * `onSubmit` recebe o payload ja validado e construido; quem decide fechar o
 * modal (sucesso) ou mante-lo aberto com erro (falha) e o componente pai --
 * este modal so exibe o `error` externo recebido via prop.
 */
function ProjectFormModal({ isOpen, project = null, clients = [], isSubmitting = false, error = null, onClose, onSubmit }) {
  const isEditing = Boolean(project);

  const [values, setValues] = useState(() =>
    isEditing ? getProjectEditValues(project) : getProjectInitialValues(),
  );
  const [validationError, setValidationError] = useState(null);
  // Trava sincrona local, adicional ao isSubmitting externo -- fecha a
  // janela de duplo clique no mesmo tick antes do proximo render refletir
  // isSubmitting. Mesmo raciocinio de mutationRef nos hooks (useAgenda.js/
  // useProjects.js), aplicado aqui no nivel do modal. Lido SOMENTE dentro
  // dos handlers (nunca durante o render) -- ler ref.current no corpo do
  // componente e proibido (react-hooks/refs).
  const localMutationRef = useRef(false);

  function updateField(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function handleClose() {
    if (isSubmitting || localMutationRef.current) return;
    onClose();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting || localMutationRef.current) return;

    setValidationError(null);
    const message = validateProjectForm(values);
    if (message) {
      setValidationError(message);
      return;
    }

    localMutationRef.current = true;
    try {
      await onSubmit(buildProjectPayload(values));
    } finally {
      localMutationRef.current = false;
    }
  }

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      closeOnOverlayClick={!isSubmitting}
      closeOnEsc={!isSubmitting}
      title={isEditing ? 'Editar projeto' : 'Novo projeto'}
      description={
        isEditing ? 'Atualize os dados deste projeto.' : 'Cadastre um novo projeto neste espaço.'
      }
      size="md"
      footer={
        <Button variant="ghost" onClick={handleClose} disabled={isSubmitting}>
          Cancelar
        </Button>
      }
    >
      <form className="uf-flex uf-flex-column uf-gap-md" onSubmit={handleSubmit}>
        <Input
          id="project-form-name"
          label="Nome"
          value={values.name}
          onChange={(event) => updateField('name', event.target.value)}
          required
          disabled={isSubmitting}
          fullWidth
        />

        <TextareaField
          id="project-form-description"
          label="Descrição (opcional)"
          value={values.description}
          onChange={(event) => updateField('description', event.target.value)}
          disabled={isSubmitting}
        />

        <SelectField
          id="project-form-status"
          label="Status"
          value={values.status}
          onChange={(event) => updateField('status', event.target.value)}
          required
          disabled={isSubmitting}
        >
          {PROJECT_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>

        <SelectField
          id="project-form-priority"
          label="Prioridade"
          value={values.priority}
          onChange={(event) => updateField('priority', event.target.value)}
          required
          disabled={isSubmitting}
        >
          {PROJECT_PRIORITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>

        <Input
          id="project-form-progress"
          label="Progresso (%)"
          type="number"
          min={0}
          max={100}
          step={1}
          value={values.progress}
          onChange={(event) => updateField('progress', event.target.value)}
          disabled={isSubmitting}
          fullWidth
        />

        <Input
          id="project-form-starts-at"
          label="Data de início (opcional)"
          type="date"
          value={values.starts_at}
          onChange={(event) => updateField('starts_at', event.target.value)}
          disabled={isSubmitting}
          fullWidth
        />

        <Input
          id="project-form-due-at"
          label="Prazo (opcional)"
          type="date"
          value={values.due_at}
          onChange={(event) => updateField('due_at', event.target.value)}
          disabled={isSubmitting}
          fullWidth
        />

        <SelectField
          id="project-form-client"
          label="Cliente (opcional)"
          value={values.client_id}
          onChange={(event) => updateField('client_id', event.target.value)}
          disabled={isSubmitting}
        >
          <option value="">Nenhum cliente</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </SelectField>

        <Input
          id="project-form-financial-impact"
          label="Impacto financeiro (opcional)"
          type="number"
          min={0}
          step="0.01"
          value={values.financial_impact}
          onChange={(event) => updateField('financial_impact', event.target.value)}
          disabled={isSubmitting}
          fullWidth
        />

        <Input
          id="project-form-next-milestone"
          label="Próximo marco (opcional)"
          value={values.next_milestone}
          onChange={(event) => updateField('next_milestone', event.target.value)}
          disabled={isSubmitting}
          fullWidth
        />

        <FormMessage>
          {validationError ||
            getProjectErrorMessage(
              error,
              isEditing
                ? 'Não foi possível atualizar o projeto. Tente novamente.'
                : 'Não foi possível criar o projeto. Tente novamente.',
            )}
        </FormMessage>

        <div className="uf-flex uf-items-center uf-justify-end uf-gap-sm uf-flex-wrap">
          <Button type="submit" loading={isSubmitting} disabled={isSubmitting}>
            {isEditing ? 'Salvar alterações' : 'Criar projeto'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default ProjectFormModal;
