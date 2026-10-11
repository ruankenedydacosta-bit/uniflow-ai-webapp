import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import {
  removeProfileAvatar,
  uploadProfileAvatar,
  validateProfileAvatarFile,
} from '../../services/storage.service.js';
import Avatar from '../../components/ui/Avatar/Avatar.jsx';
import Button from '../../components/ui/Button/Button.jsx';
import IconBox from '../../components/ui/IconBox/index.js';
import OutlineButton from '../../components/ui/OutlineButton/index.js';
import UniCard from '../../components/ui/UniCard/index.js';
import { cx } from '../../utils/cx.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import { ACCOUNT_SUBROUTE_IDS } from './simplifiedAccountRoutes.js';
import {
  PhCameraIcon,
  PhCaretDownIcon,
  PhHouseIcon,
  PhTrashIcon,
  PhWarningIcon,
} from './SimplifiedIcons.jsx';
import SimplifiedConfirmModal from './SimplifiedConfirmModal.jsx';
import SimplifiedSettingsTabs from './SimplifiedSettingsTabs.jsx';
import SimplifiedSubpageHeader from './SimplifiedSubpageHeader.jsx';
import groups from './simplifiedGroups.module.css';
import styles from './simplifiedEditProfile.module.css';
import {
  buildSimplifiedProfilePayload,
  createSimplifiedProfileForm,
  formatPhone,
  LOCALE_OPTIONS,
  PROFILE_LIMITS,
  serializeSimplifiedProfileForm,
  TEXT_SIZE_OPTIONS,
  TREATMENT_OPTIONS,
  validateSimplifiedProfileForm,
} from './simplifiedProfilePreferences.js';

function localToday() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${today.getFullYear()}-${month}-${day}`;
}

/**
 * Fase 3 do redesign (#90): aba "Perfil" da tela 14 Configurações. O
 * formulário, a foto e as confirmações continuam os mesmos; mudou só o
 * visual (campos de 44px, grupos com rótulo e card da Uni para ajuda).
 */
function SimplifiedEditProfilePage() {
  const navigate = useNavigate();
  const { user, profile, updateOwnProfile } = useSession();
  const initialForm = createSimplifiedProfileForm(profile, user);
  const [form, setForm] = useState(initialForm);
  const [savedForm, setSavedForm] = useState(initialForm);
  const [isAddressOpen, setIsAddressOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [validationError, setValidationError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarRemovalRequested, setAvatarRemovalRequested] = useState(false);
  const [avatarError, setAvatarError] = useState(null);
  const [showRemovePhotoConfirm, setShowRemovePhotoConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const fileInputRef = useRef(null);
  const mutationRef = useRef(false);

  const profileDirty = serializeSimplifiedProfileForm(form) !== serializeSimplifiedProfileForm(savedForm);
  const photoDirty = Boolean(selectedAvatarFile || avatarRemovalRequested);
  const isDirty = profileDirty || photoDirty;

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  useEffect(() => {
    if (!isDirty) return undefined;

    function handleBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const email = user?.email ?? '';
  const isEmailVerified = Boolean(user?.email_confirmed_at);

  function requestNavigation(destination) {
    if (isDirty) {
      setPendingNavigation(() => destination);
      setShowDiscardConfirm(true);
      return;
    }
    destination();
  }

  function handleBack() {
    requestNavigation(() => navigate(SIMPLIFIED_ROUTES.ACCOUNT));
  }

  function handleCancel() {
    requestNavigation(() => navigate(SIMPLIFIED_ROUTES.ACCOUNT));
  }

  function handleConfirmDiscard() {
    setShowDiscardConfirm(false);
    pendingNavigation?.();
    setPendingNavigation(null);
  }

  function handleKeepEditing() {
    setShowDiscardConfirm(false);
    setPendingNavigation(null);
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setValidationError(null);
    setSaveError(null);
    setSaveSuccess(false);
  }

  function handleAvatarChange(event) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    const error = validateProfileAvatarFile(file);
    if (error) {
      setAvatarError(error);
      return;
    }

    setAvatarError(null);
    setSelectedAvatarFile(file);
    setAvatarRemovalRequested(false);
    setAvatarPreview(URL.createObjectURL(file));
    setSaveSuccess(false);
  }

  function handleConfirmRemovePhoto() {
    setSelectedAvatarFile(null);
    setAvatarPreview(null);
    setAvatarRemovalRequested(true);
    setAvatarError(null);
    setShowRemovePhotoConfirm(false);
    setSaveSuccess(false);
  }

  async function handleSave() {
    if (!user?.id || !isDirty || mutationRef.current) return;

    const formError = validateSimplifiedProfileForm(form);
    if (formError) {
      setValidationError(formError);
      return;
    }

    mutationRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    setValidationError(null);
    setSaveSuccess(false);

    let uploadedAvatarPath = null;
    const previousAvatarPath = profile?.avatar_path ?? null;

    try {
      if (selectedAvatarFile) {
        const uploadResult = await uploadProfileAvatar(user.id, selectedAvatarFile);
        if (uploadResult.error) {
          setSaveError('Não foi possível enviar a foto. Verifique o arquivo e tente novamente.');
          return;
        }
        uploadedAvatarPath = uploadResult.data.path;
      }

      const payload = buildSimplifiedProfilePayload(form);
      if (selectedAvatarFile || avatarRemovalRequested) {
        payload.avatar_path = uploadedAvatarPath;
        payload.avatar_url = null;
      }

      const result = await updateOwnProfile(payload);
      if (result.error) {
        if (uploadedAvatarPath) await removeProfileAvatar(uploadedAvatarPath, user.id);
        setSaveError('Não foi possível salvar agora. Tente novamente.');
        return;
      }

      if (previousAvatarPath && previousAvatarPath !== uploadedAvatarPath && (selectedAvatarFile || avatarRemovalRequested)) {
        await removeProfileAvatar(previousAvatarPath, user.id);
      }

      const nextForm = createSimplifiedProfileForm(result.data, user);
      setForm(nextForm);
      setSavedForm(nextForm);
      setSelectedAvatarFile(null);
      setAvatarPreview(null);
      setAvatarRemovalRequested(false);
      setSaveSuccess(true);
    } catch {
      if (uploadedAvatarPath) await removeProfileAvatar(uploadedAvatarPath, user.id);
      setSaveError('Não foi possível salvar agora. Tente novamente.');
    } finally {
      mutationRef.current = false;
      setIsSaving(false);
    }
  }

  const hasAvatar = Boolean(avatarPreview || (!avatarRemovalRequested && profile?.avatar_url));
  const displayedAvatar = avatarRemovalRequested ? undefined : avatarPreview || profile?.avatar_url || undefined;

  return (
    <div className={styles.page} data-simplified-edit-profile>
      <SimplifiedSubpageHeader
        title="Configurações"
        onBack={handleBack}
        backLabel="Voltar para Mais"
      />

      <SimplifiedSettingsTabs
        active={ACCOUNT_SUBROUTE_IDS.EDIT_PROFILE}
        onBeforeNavigate={requestNavigation}
      />

      <section className={groups.group} aria-label="Foto de perfil">
        <h2 className={groups.groupLabel}>Foto de perfil</h2>
        <div className={styles.photoRow}>
          <Avatar src={displayedAvatar} name={form.full_name || undefined} size="lg" className={styles.avatar} />
          <div className={styles.photoInfo}>
            <p className={styles.photoHint}>JPEG, PNG ou WebP de até 5 MB.</p>
            <input
              ref={fileInputRef}
              className={styles.fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarChange}
              aria-label="Selecionar nova foto de perfil"
            />
            <div className={styles.photoActions}>
              <OutlineButton onClick={() => fileInputRef.current?.click()}>
                <PhCameraIcon />
                Trocar foto
              </OutlineButton>
              <OutlineButton
                variant="secondary"
                disabled={!hasAvatar}
                onClick={() => setShowRemovePhotoConfirm(true)}
              >
                <PhTrashIcon />
                Remover foto
              </OutlineButton>
            </div>
            {avatarPreview ? <p className={styles.notice} role="status">Prévia pronta. Salve para confirmar a nova foto.</p> : null}
            {avatarRemovalRequested ? <p className={styles.notice} role="status">A foto será removida ao salvar.</p> : null}
            {avatarError ? <p className={styles.fieldError} role="alert">{avatarError}</p> : null}
          </div>
        </div>
      </section>

      <section className={cx(groups.group, styles.fields)} aria-label="Dados pessoais">
        <h2 className={groups.groupLabel}>Dados pessoais</h2>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Nome completo</span>
          <input
            type="text"
            className={styles.input}
            value={form.full_name}
            onChange={(event) => updateField('full_name', event.target.value)}
            placeholder="Seu nome completo"
            autoComplete="name"
            maxLength={PROFILE_LIMITS.FULL_NAME}
            required
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Como deseja ser chamado</span>
          <input
            type="text"
            className={styles.input}
            value={form.preferred_name}
            onChange={(event) => updateField('preferred_name', event.target.value)}
            placeholder="Ex.: Ruan, Ru ou Dona Maria"
            maxLength={PROFILE_LIMITS.PREFERRED_NAME}
          />
          <p className={styles.fieldHint}>Opcional. Seu nome completo permanece inalterado.</p>
        </label>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>E-mail</span>
          <div className={styles.readOnlyRow}>
            <span>{email || 'Ainda não definido'}</span>
            {isEmailVerified ? (
              <span className={cx(groups.pill, groups.pillGreen)}>Verificado</span>
            ) : null}
          </div>
          <p className={styles.fieldHint}>O e-mail é gerenciado pela sua conta de acesso.</p>
        </div>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Telefone</span>
          <input
            type="tel"
            className={styles.input}
            value={form.phone}
            onChange={(event) => updateField('phone', formatPhone(event.target.value))}
            placeholder="(11) 99999-9999"
            autoComplete="tel"
            inputMode="numeric"
          />
          <p className={styles.fieldHint}>Opcional. Nenhuma verificação por SMS será enviada.</p>
        </label>

        <div className={styles.fieldRow}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Forma de tratamento</span>
            <select
              className={styles.input}
              value={form.treatment_preference}
              onChange={(event) => updateField('treatment_preference', event.target.value)}
            >
              {TREATMENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          {form.treatment_preference === 'other' ? (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Como prefere ser tratado</span>
              <input
                type="text"
                className={styles.input}
                value={form.custom_treatment}
                onChange={(event) => updateField('custom_treatment', event.target.value)}
                maxLength={PROFILE_LIMITS.CUSTOM_TREATMENT}
                placeholder="Informe uma forma curta"
              />
            </label>
          ) : null}

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Data de nascimento</span>
            <input
              type="date"
              className={styles.input}
              value={form.birth_date}
              max={localToday()}
              onChange={(event) => updateField('birth_date', event.target.value)}
            />
            <p className={styles.fieldHint}>Opcional.</p>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Idioma</span>
            <select
              className={styles.input}
              value={form.locale}
              onChange={(event) => updateField('locale', event.target.value)}
            >
              {LOCALE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className={styles.fieldHint}>Outros idiomas serão habilitados somente quando houver tradução completa.</p>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Tamanho do texto</span>
            <select
              className={styles.input}
              value={form.text_size}
              onChange={(event) => updateField('text_size', event.target.value)}
            >
              {TEXT_SIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className={styles.fieldHint}>A preferência é aplicada ao aplicativo simplificado.</p>
          </label>
        </div>
      </section>

      <section className={groups.group} aria-label="Endereço e dados de cobrança">
        <button
          type="button"
          className={cx(groups.row, styles.expandHeader)}
          onClick={() => setIsAddressOpen((open) => !open)}
          aria-expanded={isAddressOpen}
        >
          <IconBox><PhHouseIcon /></IconBox>
          <span className={groups.rowText}>
            <span className={groups.rowTitle}>Endereço e dados de cobrança</span>
            <span className={groups.rowSubtitle}>Usado para emissão de nota fiscal e cobrança.</span>
          </span>
          <span className={cx(groups.caret, styles.chevron, isAddressOpen && styles.chevronOpen)} aria-hidden="true">
            <PhCaretDownIcon />
          </span>
        </button>
        {isAddressOpen ? (
          <p className={styles.expandBody}>
            Os dados de cobrança ainda não possuem uma estrutura segura definida. Nenhuma informação fictícia será armazenada.
          </p>
        ) : null}
      </section>

      {validationError || saveError ? <p className={styles.errorBanner} role="alert">{validationError || saveError}</p> : null}
      {saveSuccess && !isDirty ? (
        <p className={styles.successBanner} role="status">Alterações salvas com sucesso.</p>
      ) : null}

      <div className={styles.actions}>
        <Button
          type="button"
          variant="primary"
          fullWidth
          loading={isSaving}
          disabled={!isDirty || isSaving}
          onClick={handleSave}
        >
          Salvar alterações
        </Button>
        <OutlineButton variant="secondary" className={styles.cancelButton} onClick={handleCancel}>
          Cancelar
        </OutlineButton>
      </div>

      <UniCard
        title="Precisa de ajuda para alterar algo?"
        actions={(
          <OutlineButton onClick={() => navigate(SIMPLIFIED_ROUTES.UNI)}>Falar com a Uni</OutlineButton>
        )}
      >
        <p>Converse com a Uni.</p>
      </UniCard>

      <SimplifiedConfirmModal
        open={showRemovePhotoConfirm}
        onClose={() => setShowRemovePhotoConfirm(false)}
        icon={<PhTrashIcon />}
        title="Remover foto de perfil?"
        description="A remoção será concluída quando você salvar as alterações."
        confirmLabel="Remover foto"
        onConfirm={handleConfirmRemovePhoto}
      >
        <p>Você poderá selecionar uma nova foto antes de salvar.</p>
      </SimplifiedConfirmModal>

      <SimplifiedConfirmModal
        open={showDiscardConfirm}
        onClose={handleKeepEditing}
        icon={<PhWarningIcon />}
        title="Descartar alterações?"
        description="Você tem alterações não salvas nesta tela."
        confirmLabel="Descartar"
        onConfirm={handleConfirmDiscard}
        cancelLabel="Continuar editando"
      />
    </div>
  );
}

export default SimplifiedEditProfilePage;
