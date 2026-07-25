import { useState } from 'react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { SelectField, TextField, TextareaField, FormMessage } from './SupportRequestFormPrimitives.jsx';
import {
  SUPPORT_REQUEST_CATEGORIES,
  SUPPORT_REQUEST_IMPACT_LEVELS,
  SUPPORT_REQUEST_PLATFORMS,
  createEmptySupportRequestForm,
  validateSupportRequestForm,
  buildSupportRequestPayload,
} from './supportRequestFormUtils.js';
import { createSupportRequest } from './supportRequestService.js';

/**
 * SUPORTE1: formulário de "relatar problema" / escalonamento para
 * atendimento humano. `initialSubject`/`initialCategory` vêm do
 * escalonamento inteligente (pergunta sem resposta na base) -- preenchem
 * só categoria/assunto genéricos, NUNCA o texto da pergunta do usuário sem
 * revisão (o campo fica editável, o usuário sempre revisa antes de
 * enviar).
 */
function SupportRequestFormModal({
  open, onClose, onCreated, userId, workspaceId, conversationId,
  initialCategory = '', initialSubject = '',
}) {
  const [form, setForm] = useState(() => ({
    ...createEmptySupportRequestForm(),
    category: initialCategory,
    subject: initialSubject,
  }));
  const [validationError, setValidationError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleClose() {
    if (isSubmitting) return;
    onClose?.();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting) return;

    setValidationError(null);
    setSubmitError(null);

    const message = validateSupportRequestForm(form);
    if (message) {
      setValidationError(message);
      return;
    }

    setIsSubmitting(true);
    const payload = buildSupportRequestPayload(form, { userId, workspaceId, conversationId });
    const { data, error } = await createSupportRequest(payload);
    setIsSubmitting(false);

    if (error || !data) {
      setSubmitError('Não foi possível enviar sua solicitação agora. Tente novamente em instantes.');
      return;
    }

    onCreated?.(data);
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Relatar um problema"
      description="Nossa equipe vai analisar sua solicitação. Você pode acompanhar o status depois."
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="support-request-form" disabled={isSubmitting}>
            {isSubmitting ? 'Enviando…' : 'Enviar solicitação'}
          </Button>
        </>
      )}
    >
      <form id="support-request-form" className="uf-flex uf-flex-column uf-gap-md" onSubmit={handleSubmit}>
        <FormMessage tone="warning" id="support-request-privacy-notice">
          Não envie senhas, dados completos de cartão, chaves de acesso ou informações bancárias confidenciais.
        </FormMessage>

        <SelectField
          id="support-request-category"
          label="Categoria"
          value={form.category}
          onChange={(e) => updateField('category', e.target.value)}
          required
        >
          <option value="" disabled>Escolha uma categoria</option>
          {SUPPORT_REQUEST_CATEGORIES.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </SelectField>

        <TextField
          id="support-request-subject"
          label="Assunto"
          value={form.subject}
          onChange={(e) => updateField('subject', e.target.value)}
          maxLength={150}
          required
        />

        <TextareaField
          id="support-request-description"
          label="Descreva o problema"
          value={form.description}
          onChange={(e) => updateField('description', e.target.value)}
          maxLength={4000}
          required
        />

        <SelectField
          id="support-request-impact"
          label="Impacto"
          value={form.impact}
          onChange={(e) => updateField('impact', e.target.value)}
        >
          {SUPPORT_REQUEST_IMPACT_LEVELS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </SelectField>

        <SelectField
          id="support-request-platform"
          label="Onde o problema aconteceu?"
          value={form.platform}
          onChange={(e) => updateField('platform', e.target.value)}
        >
          {SUPPORT_REQUEST_PLATFORMS.map((opt) => (
            <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
          ))}
        </SelectField>

        <FormMessage tone="danger">{validationError || submitError}</FormMessage>
      </form>
    </Modal>
  );
}

export default SupportRequestFormModal;
