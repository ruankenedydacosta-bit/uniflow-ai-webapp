import { useState } from 'react';
import { useAccess } from '../app/AccessContext';
import { useSession } from '../app/SessionContext.jsx';
import { PLANS, USER_MODES, WORKSPACE_TYPES } from '../app/access.js';
import Avatar from '../components/ui/Avatar';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { cx } from '../utils/cx';
import { ThemeSelector } from '../features/theme';
import ComingSoonSection from './configuracoes/ComingSoonSection.jsx';
import ProfileEditModal from './configuracoes/ProfileEditModal.jsx';
import { getProfileDisplayName } from './configuracoes/profileFormUtils.js';
import { settingsMock } from './configuracoes/settings.mock.js';
import styles from './SettingsPage.module.css';

const USER_MODE_LABELS = {
  [USER_MODES.PERSONAL]: 'Pessoal',
  [USER_MODES.BUSINESS]: 'Empresarial',
  [USER_MODES.BOTH]: 'Pessoal + Empresa',
};

const PLAN_LABELS = {
  [PLANS.FREE]: 'Free',
  [PLANS.PRO]: 'Pro',
  [PLANS.BUSINESS]: 'Business',
  [PLANS.ENTERPRISE]: 'Enterprise',
};

function getSettingsContext(currentWorkspace) {
  return currentWorkspace === WORKSPACE_TYPES.PERSONAL ? settingsMock.personal : settingsMock.business;
}

function SettingsPage() {
  const { access } = useAccess();
  const { isLoading, isSupabaseConfigured, profile, refreshSession, user } = useSession();
  const settings = getSettingsContext(access.currentWorkspace);
  const showSpaces = access.currentWorkspace === WORKSPACE_TYPES.BUSINESS || access.userMode === USER_MODES.BOTH;
  const currentModeLabel = USER_MODE_LABELS[access.userMode];
  const currentPlanLabel = PLAN_LABELS[access.plan];

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileJustSaved, setProfileJustSaved] = useState(false);

  const profileDisplayName = getProfileDisplayName(profile, user);
  const profileEmail = user?.email ?? '';
  const profilePhone = profile?.phone;

  // Edicao real exige um usuario autenticado de verdade -- sem sessao
  // (modo demo, sem Supabase configurado) nao ha profile persistivel.
  const canEditProfile = Boolean(user?.id) && !isLoading;

  function getEditProfileTitle() {
    if (!isSupabaseConfigured) return 'Indisponível no modo demonstração.';
    if (isLoading) return 'Carregando perfil...';
    if (!user) return 'Nenhum usuário autenticado.';
    return 'Editar seu perfil.';
  }

  function handleOpenEditProfile() {
    if (!canEditProfile) return;
    setProfileJustSaved(false);
    setIsEditingProfile(true);
  }

  function handleCloseEditProfile() {
    setIsEditingProfile(false);
  }

  // Reflete a mudanca no restante do app imediatamente (Topbar, saudacoes,
  // etc. que ja leem profile.full_name de SessionContext) -- sem isso, a
  // propria tela de Configuracoes ficaria correta mas o resto do app
  // continuaria mostrando o nome antigo ate um reload manual.
  async function handleProfileSaved() {
    await refreshSession();
    setProfileJustSaved(true);
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="settings-title">
        <div className={styles.heroCopy}>
          <Badge variant="secondary" dot>
            {settings.workspaceLabel}
          </Badge>
          <h2 id="settings-title">Configurações</h2>
          <p>Ajuste sua experiência, preferências da Uni e controle da sua conta.</p>
        </div>

        <div className={styles.actions}>
          <Button disabled={!canEditProfile} title={getEditProfileTitle()} onClick={handleOpenEditProfile}>
            Editar perfil
          </Button>
          <Button variant="secondary" disabled title="Disponível em breve.">
            Perguntar à Uni
          </Button>
        </div>
      </section>

      <section className={styles.profileGrid} aria-label="Perfil e modo de uso">
        <Card variant="glass" padding="lg" className={styles.profileCard}>
          <div className={styles.profileHeader}>
            <Avatar name={profileDisplayName} src={profile?.avatar_url} size="lg" status="online" />
            <div>
              <span className={styles.eyebrow}>Perfil</span>
              <h3>{profileDisplayName}</h3>
              <p>{profileEmail || 'E-mail não disponível'}</p>
            </div>
          </div>

          {profileJustSaved ? (
            <p role="status" className="uf-text-caption">Perfil atualizado.</p>
          ) : null}

          <div className={styles.profileDetails}>
            <div>
              <span>Tipo de conta</span>
              <strong>{currentModeLabel}</strong>
            </div>
            <div>
              <span>Plano atual</span>
              <strong>{currentPlanLabel}</strong>
            </div>
            <div>
              <span>Telefone</span>
              <strong>{profilePhone || 'Não informado'}</strong>
            </div>
          </div>
        </Card>

        <Card variant="outline" padding="lg" className={styles.modeCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Modo de uso</h3>
              <p>Estado atual do acesso demo, sem alterar a lógica real.</p>
            </div>
          </div>

          <div className={styles.modeList}>
            {settingsMock.usageModes.map((mode) => {
              const isActive = mode.value === access.userMode;

              return (
                <div key={mode.value} className={cx(styles.modeItem, isActive && styles.activeItem)}>
                  <div>
                    <strong>{mode.label}</strong>
                    <p>{mode.description}</p>
                  </div>
                  {isActive ? (
                    <Badge variant="success" size="sm" dot>
                      Ativo
                    </Badge>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      </section>

      <section aria-label="Aparência">
        <ThemeSelector />
      </section>

      <section className={styles.preferencesGrid} aria-label="Preferências da UniFlow">
        <ComingSoonSection
          title="Preferências da Uni"
          description="Como a Uni deve orientar sem aumentar esforço mental."
          message="Personalização de tom, explicações e alertas estará disponível em uma próxima etapa."
        />

        <ComingSoonSection
          title="Voz e interação"
          description="Recursos para conversar com a Uni por voz."
          message="Configurações de voz e interação ainda não estão disponíveis nesta tela."
        />

        <ComingSoonSection
          title="Notificações"
          description="A Uni só deve interromper quando houver valor real."
          message="Preferências de notificações ainda não estão disponíveis."
        />

        <Card variant="default" padding="lg" className={styles.settingsCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Privacidade e segurança</h3>
              <p>Como seus dados são protegidos hoje.</p>
            </div>
          </div>
          <div className={styles.dotList}>
            {settingsMock.privacy.map((item) => (
              <div key={item} className={styles.dotItem}>
                <span aria-hidden="true" />
                <p>{item}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className={styles.guidanceGrid} aria-label="Espaços e leitura da Uni">
        {showSpaces ? (
          <Card variant="outline" padding="lg" className={styles.spacesCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h3>Espaços</h3>
                <p>Separação visual para manter dados pessoais e empresariais claros.</p>
              </div>
            </div>
            <div className={styles.spaceList}>
              <div className={styles.spaceItem}>
                <Badge variant={access.currentWorkspace === WORKSPACE_TYPES.BUSINESS ? 'primary' : 'secondary'} size="sm">
                  {settings.workspaceLabel}
                </Badge>
                <p>Você está usando este espaço agora.</p>
              </div>
            </div>
          </Card>
        ) : null}

        <Card variant="glass" padding="lg" className={styles.uniCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Leitura da Uni</h3>
              <p>Configurações devem aumentar clareza, segurança e confiança.</p>
            </div>
            <Badge variant="secondary" size="sm">
              Em breve
            </Badge>
          </div>
          <p>Leitura personalizada com base nos seus dados reais estará disponível em uma próxima etapa.</p>
        </Card>
      </section>

      {isEditingProfile ? (
        <ProfileEditModal
          open
          profile={profile}
          user={user}
          onClose={handleCloseEditProfile}
          onSaved={handleProfileSaved}
        />
      ) : null}
    </div>
  );
}

export default SettingsPage;
