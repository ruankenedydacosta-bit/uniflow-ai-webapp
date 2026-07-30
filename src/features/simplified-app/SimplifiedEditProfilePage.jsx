import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import { updateProfile } from '../../services/profileService.js';
import Avatar from '../../components/ui/Avatar/Avatar.jsx';
import Badge from '../../components/ui/Badge/Badge.jsx';
import Button from '../../components/ui/Button/Button.jsx';
import Modal from '../../components/ui/Modal/Modal.jsx';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import {
  CameraIcon,
  CheckIcon,
  ChevronDownIcon,
  GlobeIcon,
  AccountIcon,
  MailIcon,
  MicIcon,
  PhoneIcon,
  TextSizeIcon,
  TrashIcon,
} from './SimplifiedIcons.jsx';
import styles from './simplifiedEditProfile.module.css';

function BackIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M20 6 10 16l10 10" />
    </svg>
  );
}

function HomeIconPlaceholder() {
  // Reaproveita o mesmo estilo de ícone de casa usado na secao de endereco,
  // sem depender de um icone novo dedicado so para este estado vazio.
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="m4 15 12-10 12 10v13h-8v-8h-8v8H4Z" />
    </svg>
  );
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * ETAPA 4 -- Editar perfil (Fase 1 confirmou por auditoria real do schema):
 * a tabela public.profiles só tem full_name, avatar_url e phone como campos
 * de identidade editáveis de verdade. Não existem colunas para nome
 * preferido, saudação, data de nascimento, idioma, tamanho de texto ou
 * endereço -- por isso essas seções aparecem visualmente (fidelidade à
 * referência) mas ficam honestamente marcadas como indisponíveis para
 * edição nesta versão, em vez de fingir persistência que não existe.
 */
function SimplifiedEditProfilePage() {
  const navigate = useNavigate();
  const { user, profile, refreshSession } = useSession();

  const originalFullName = cleanText(profile?.full_name);
  const originalPhone = cleanText(profile?.phone);

  const [fullName, setFullName] = useState(originalFullName);
  const [phone, setPhone] = useState(originalPhone);
  const [isAddressOpen, setIsAddressOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [photoNotice, setPhotoNotice] = useState(null);
  const [showRemovePhotoConfirm, setShowRemovePhotoConfirm] = useState(false);
  const [isRemovingPhoto, setIsRemovingPhoto] = useState(false);
  const [removePhotoError, setRemovePhotoError] = useState(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);

  const isDirty = fullName !== originalFullName || phone !== originalPhone;

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

  async function handleSave() {
    if (!user?.id || !isDirty) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const result = await updateProfile(user.id, {
      full_name: fullName,
      phone,
    });

    setIsSaving(false);

    if (result.error) {
      setSaveError('Não foi possível salvar agora. Tente novamente.');
      return;
    }

    // Mostra a confirmação antes de ressincronizar a sessão: refreshSession
    // aciona brevemente o loading global (mesmo mecanismo do switchWorkspace
    // em SessionContext.jsx), o que desmonta e remonta esta tela -- aguardar
    // a chamada aqui perderia o estado local e a mensagem nunca apareceria.
    setSaveSuccess(true);
    refreshSession();
  }

  async function handleConfirmRemovePhoto() {
    if (!user?.id) return;
    setIsRemovingPhoto(true);
    setRemovePhotoError(null);

    const result = await updateProfile(user.id, { avatar_url: null });

    setIsRemovingPhoto(false);

    if (result.error) {
      setRemovePhotoError('Não foi possível remover a foto agora. Tente novamente.');
      return;
    }

    await refreshSession();
    setShowRemovePhotoConfirm(false);
  }

  const hasAvatar = Boolean(profile?.avatar_url);

  return (
    <div className={styles.page} data-simplified-edit-profile>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <button
            type="button"
            className={styles.backButton}
            onClick={handleBack}
            aria-label="Voltar para Conta"
          >
            <BackIcon />
          </button>
          <h1>Editar perfil</h1>
        </div>
        <button type="button" className={styles.talkButton} onClick={() => navigate(SIMPLIFIED_ROUTES.UNI)}>
          <span className={styles.talkIcon} aria-hidden="true"><MicIcon /></span>
          Falar com a Uni
        </button>
      </header>

      <p className={styles.subtitle}>Atualize seus dados para que a Uni possa te conhecer melhor.</p>

      <section className={styles.card} aria-label="Foto de perfil">
        <div className={styles.photoRow}>
          <Avatar src={profile?.avatar_url || undefined} name={fullName || undefined} size="xl" />
          <div className={styles.photoInfo}>
            <strong>Foto de perfil</strong>
            <p>Mostre quem você é para a Uni.</p>
            <div className={styles.photoActions}>
              <Button
                type="button"
                variant="primary"
                size="sm"
                leftIcon={<CameraIcon />}
                onClick={() => setPhotoNotice(
                  'O envio de novas fotos ainda não está disponível nesta versão.',
                )}
              >
                Trocar foto
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={styles.darkOutlineButton}
                leftIcon={<TrashIcon />}
                disabled={!hasAvatar}
                onClick={() => setShowRemovePhotoConfirm(true)}
              >
                Remover foto
              </Button>
            </div>
            {photoNotice ? (
              <p className={styles.notice} role="status">{photoNotice}</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className={styles.card} aria-label="Dados pessoais">
        <label className={styles.field}>
          <span className={styles.fieldLabel}>
            <span className={styles.fieldIcon} aria-hidden="true"><AccountIcon /></span>
            Nome completo
          </span>
          <input
            type="text"
            className={styles.input}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Seu nome completo"
            autoComplete="name"
          />
        </label>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>
            <span className={styles.fieldIcon} aria-hidden="true"><AccountIcon /></span>
            Como deseja ser chamado
          </span>
          <div className={styles.unavailableRow}>
            <span>Ainda não definido</span>
            <Badge variant="default" size="sm">Em breve</Badge>
          </div>
          <p className={styles.fieldHint}>Isso ficará disponível em uma próxima versão.</p>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>
            <span className={styles.fieldIcon} aria-hidden="true"><MailIcon /></span>
            E-mail
          </span>
          <div className={styles.readOnlyRow}>
            <span>{email || 'Ainda não definido'}</span>
            {isEmailVerified ? (
              <Badge variant="success" size="sm" leftIcon={<CheckIcon />}>Verificado</Badge>
            ) : null}
          </div>
          <p className={styles.fieldHint}>O e-mail é gerenciado pela sua conta de acesso.</p>
        </div>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>
            <span className={styles.fieldIcon} aria-hidden="true"><PhoneIcon /></span>
            Telefone
          </span>
          <input
            type="tel"
            className={styles.input}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Adicionar telefone"
            autoComplete="tel"
          />
        </label>

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>
              <span className={styles.fieldIcon} aria-hidden="true"><AccountIcon /></span>
              Forma de tratamento
            </span>
            <div className={styles.unavailableRow}>
              <span>Não informado</span>
              <Badge variant="default" size="sm">Em breve</Badge>
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>
              <span className={styles.fieldIcon} aria-hidden="true"><AccountIcon /></span>
              Data de nascimento
            </span>
            <div className={styles.unavailableRow}>
              <span>Ainda não definido</span>
              <Badge variant="default" size="sm">Opcional</Badge>
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>
              <span className={styles.fieldIcon} aria-hidden="true"><GlobeIcon /></span>
              Idioma
            </span>
            <div className={styles.unavailableRow}>
              <span>Português (Brasil)</span>
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>
              <span className={styles.fieldIcon} aria-hidden="true"><TextSizeIcon /></span>
              Tamanho do texto
            </span>
            <div className={styles.unavailableRow}>
              <span>Padrão</span>
              <Badge variant="default" size="sm">Em breve</Badge>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.card} aria-label="Endereço e dados de cobrança">
        <button
          type="button"
          className={styles.expandHeader}
          onClick={() => setIsAddressOpen((open) => !open)}
          aria-expanded={isAddressOpen}
        >
          <span className={styles.expandIcon} aria-hidden="true"><HomeIconPlaceholder /></span>
          <span className={styles.expandTitle}>
            <strong>Endereço e dados de cobrança</strong>
            <small>Usado para emissão de nota fiscal e cobrança.</small>
          </span>
          <span className={`${styles.chevron} ${isAddressOpen ? styles.chevronOpen : ''}`} aria-hidden="true">
            <ChevronDownIcon />
          </span>
        </button>
        {isAddressOpen ? (
          <div className={styles.expandBody}>
            <p>Nenhum endereço cadastrado ainda. Isso ficará disponível junto com o pagamento.</p>
          </div>
        ) : null}
      </section>

      {saveError ? <p className={styles.errorBanner} role="alert">{saveError}</p> : null}
      {saveSuccess && !isDirty ? (
        <p className={styles.successBanner} role="status">Alterações salvas com sucesso.</p>
      ) : null}

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
      <Button
        type="button"
        variant="outline"
        className={styles.darkOutlineButton}
        fullWidth
        onClick={handleCancel}
      >
        Cancelar
      </Button>

      <section className={`${styles.card} ${styles.helpCard}`} aria-label="Ajuda">
        <span className={styles.helpMascot} aria-hidden="true">🙂</span>
        <div className={styles.helpText}>
          <strong>Precisa de ajuda para alterar algo?</strong>
          <p>Converse com a Uni.</p>
        </div>
        <button type="button" className={styles.talkButton} onClick={() => navigate(SIMPLIFIED_ROUTES.UNI)}>
          <span className={styles.talkIcon} aria-hidden="true"><MicIcon /></span>
          Falar com a Uni
        </button>
      </section>

      <Modal
        open={showRemovePhotoConfirm}
        onClose={() => { if (!isRemovingPhoto) { setShowRemovePhotoConfirm(false); setRemovePhotoError(null); } }}
        title="Remover foto de perfil?"
        description="Você poderá adicionar outra foto quando o envio estiver disponível."
        footer={(
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setShowRemovePhotoConfirm(false); setRemovePhotoError(null); }}
              disabled={isRemovingPhoto}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirmRemovePhoto}
              loading={isRemovingPhoto}
            >
              Remover foto
            </Button>
          </>
        )}
      >
        {removePhotoError ? <p className={styles.errorBanner} role="alert">{removePhotoError}</p> : null}
      </Modal>

      <Modal
        open={showDiscardConfirm}
        onClose={handleKeepEditing}
        title="Descartar alterações?"
        description="Você tem alterações não salvas nesta tela."
        footer={(
          <>
            <Button type="button" variant="secondary" onClick={handleKeepEditing}>
              Continuar editando
            </Button>
            <Button type="button" variant="danger" onClick={handleConfirmDiscard}>
              Descartar
            </Button>
          </>
        )}
      />
    </div>
  );
}

export default SimplifiedEditProfilePage;
