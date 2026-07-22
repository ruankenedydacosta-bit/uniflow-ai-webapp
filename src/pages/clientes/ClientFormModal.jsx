import { useState } from 'react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { FormMessage, SelectField } from './ClientFormPrimitives';
import {
  buildClientMutationPayload,
  createClientEditForm,
  createEmptyClientForm,
  getClientErrorMessage,
  validateClientForm,
} from './clientFormUtils.js';

function ClientFormModal({ client = null, clientState, onClose, open }) {
  const [form, setForm] = useState(() =>
    client ? createClientEditForm(client) : createEmptyClientForm(),
  );
  const [validationError, setValidationError] = useState(null);
  const isEditing = Boolean(client);
  const isMutating = clientState.isMutating;

  // Bloqueia fechamento (X, overlay, ESC ou botao Cancelar) enquanto uma
  // mutacao esta em andamento -- todos os gatilhos de fechamento do Modal
  // passam por este handler.
  function handleClose() {
    if (isMutating) return;
    onClose();
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isMutating) return;

    const validationMessage = validateClientForm(form);
    if (validationMessage) {
      setValidationError(validationMessage);
      return;
    }
    setValidationError(null);

    const payload = buildClientMutationPayload(form);
    // Contrato real de saveClient (useClients.js): sempre resolve para
    // { data, error, isConfigured } -- nunca lanca excecao em falha de
    // negocio/RLS/validacao. Sucesso = error falsy.
    const result = await clientState.saveClient(payload, client?.id ?? null);

    if (!result.error) {
      onClose();
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeOnOverlayClick={!isMutating}
      closeOnEsc={!isMutating}
      title={isEditing ? 'Editar cliente' : 'Novo cliente'}
      description={
        isEditing
          ? 'Atualize os dados deste cliente.'
          : 'Cadastre um novo cliente deste espaço.'
      }
      size="md"
      footer={
        <Button variant="ghost" onClick={handleClose} disabled={isMutating}>
          Cancelar
        </Button>
      }
    >
      <form className="uf-flex uf-flex-column uf-gap-md" onSubmit={handleSubmit}>
        <Input
          id="client-form-name"
          label="Nome"
          value={form.name}
          onChange={(event) => updateField('name', event.target.value)}
          required
          fullWidth
        />
        <SelectField
          id="client-form-entity-type"
          label="Tipo"
          value={form.entity_type}
          onChange={(event) => updateField('entity_type', event.target.value)}
        >
          <option value="person">Pessoa</option>
          <option value="company">Empresa</option>
        </SelectField>
        <SelectField
          id="client-form-lifecycle-stage"
          label="Estágio"
          value={form.lifecycle_stage}
          onChange={(event) => updateField('lifecycle_stage', event.target.value)}
        >
          <option value="lead">Lead</option>
          <option value="potential">Potencial</option>
          <option value="active">Ativo</option>
          <option value="at_risk">Em risco</option>
          <option value="inactive">Inativo</option>
        </SelectField>
        <SelectField
          id="client-form-relationship-status"
          label="Condição operacional (opcional)"
          value={form.relationship_status}
          onChange={(event) => updateField('relationship_status', event.target.value)}
        >
          <option value="">Nenhuma</option>
          <option value="new">Novo</option>
          <option value="in_negotiation">Em negociação</option>
          <option value="waiting_customer">Aguardando cliente</option>
          <option value="waiting_company">Aguardando empresa</option>
          <option value="in_delivery">Em entrega</option>
          <option value="completed">Concluído</option>
          <option value="paused">Pausado</option>
        </SelectField>
        <Input
          id="client-form-primary-contact-name"
          label="Nome do contato principal (opcional)"
          helperText="Relevante quando o cliente é uma empresa."
          value={form.primary_contact_name}
          onChange={(event) => updateField('primary_contact_name', event.target.value)}
          fullWidth
        />
        <Input
          id="client-form-email"
          label="E-mail (opcional)"
          type="email"
          value={form.email}
          onChange={(event) => updateField('email', event.target.value)}
          fullWidth
        />
        <Input
          id="client-form-phone"
          label="Telefone (opcional)"
          type="tel"
          value={form.phone}
          onChange={(event) => updateField('phone', event.target.value)}
          fullWidth
        />
        <Input
          id="client-form-document-number"
          label="Documento (opcional)"
          value={form.document_number}
          onChange={(event) => updateField('document_number', event.target.value)}
          fullWidth
        />
        <Input
          id="client-form-estimated-value"
          label="Valor estimado (opcional)"
          type="number"
          min="0"
          step="0.01"
          value={form.estimated_value}
          onChange={(event) => updateField('estimated_value', event.target.value)}
          fullWidth
        />
        <Input
          id="client-form-last-contact-at"
          label="Último contato (opcional)"
          type="datetime-local"
          value={form.last_contact_at}
          onChange={(event) => updateField('last_contact_at', event.target.value)}
          fullWidth
        />
        <Input
          id="client-form-next-action"
          label="Próxima ação (opcional)"
          value={form.next_action}
          onChange={(event) => updateField('next_action', event.target.value)}
          fullWidth
        />

        <FormMessage>
          {validationError ||
            getClientErrorMessage(
              clientState.error,
              'Não foi possível salvar o cliente. Tente novamente.',
            )}
        </FormMessage>

        <div className="uf-flex uf-items-center uf-justify-end uf-gap-sm uf-flex-wrap">
          <Button type="submit" loading={isMutating}>
            {isEditing ? 'Salvar cliente' : 'Criar cliente'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default ClientFormModal;
