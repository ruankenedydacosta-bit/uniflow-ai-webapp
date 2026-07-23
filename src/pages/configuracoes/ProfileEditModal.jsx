import { useRef, useState } from 'react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { updateProfile } from '../../services/profileService.js';
import {
  buildProfileUpdatePayload,
  createProfileEditForm,
  getProfileErrorMessage,
  validateProfileForm,
} from './profileFormUtils.js';

/**
 * Edicao minima do perfil real (CFG3): nome completo e telefone. E-mail e
 * somente leitura (troca de e-mail fora de escopo). Imagem de perfil
 * permanece somente leitura nesta fase (nenhum novo recurso de arquivo
 * remoto foi adicionado ao projeto). Persiste via profileService.updateProfile
 * -- nunca chama Supabase diretamente aqui. Sucesso dispara onSaved (que
 * cabe ao chamador sincronizar com SessionContext) antes de fechar a modal.
 */
function ProfileEditModal({ open, profile, user, onClose, onSaved }) {
  const [form, setForm] = useState(() => createProfileEditForm(profile, user));
  const [validationError, setValidationError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  // Trava sincrona contra duplo submit -- mesmo padrao de mutationRef ja
  // usado em useClients.js/useAgenda.js/useTransactions.js.
  const mutationRef = useRef(false);

  function handleClose() {
    if (isSaving) return;
    onClose();
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (mutationRef.current) return;

    const validationMessage = validateProfileForm(form);
    if (validationMessage) {
      setValidationError(validationMessage);
      return;
    }
    setValidationError(null);
    setSaveError(null);

    mutationRef.current = true;
    setIsSaving(true);

    try {
      const payload = buildProfileUpdatePayload(form);
      // Contrato real de updateProfile (profileService.js): sempre resolve
      // para { data, error, isConfigured } -- nunca lanca excecao em falha
      // de negocio/RLS/validacao. Sucesso = error falsy.
      const result = await updateProfile(user?.id, payload);

      if (result.error) {
        setSaveError(result.error);
        return;
      }

      await onSaved?.(result.data);
      onClose();
    } finally {
      mutationRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeOnOverlayClick={!isSaving}
      closeOnEsc={!isSaving}
      title="Editar perfil"
      description="Atualize seu nome e telefone de contato."
      size="sm"
      footer={
        <Button variant="ghost" onClick={handleClose} disabled={isSaving}>
          Cancelar
        </Button>
      }
    >
      <form className="uf-flex uf-flex-column uf-gap-md" onSubmit={handleSubmit}>
        <Input
          id="profile-form-full-name"
          label="Nome completo"
          value={form.full_name}
          onChange={(event) => updateField('full_name', event.target.value)}
          required
          fullWidth
        />

        <Input
          id="profile-form-email"
          label="E-mail"
          type="email"
          value={user?.email ?? ''}
          disabled
          helperText="O e-mail não pode ser alterado aqui."
          fullWidth
        />

        <Input
          id="profile-form-phone"
          label="Telefone (opcional)"
          type="tel"
          value={form.phone}
          onChange={(event) => updateField('phone', event.target.value)}
          fullWidth
        />

        {validationError || saveError ? (
          <p role="alert" className="uf-p-md uf-rounded-md uf-bg-danger-subtle uf-text-danger uf-text-caption">
            {validationError
              || getProfileErrorMessage(saveError, 'Não foi possível salvar o perfil. Tente novamente.')}
          </p>
        ) : null}

        <div className="uf-flex uf-items-center uf-justify-end uf-gap-sm uf-flex-wrap">
          <Button type="submit" loading={isSaving}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default ProfileEditModal;
