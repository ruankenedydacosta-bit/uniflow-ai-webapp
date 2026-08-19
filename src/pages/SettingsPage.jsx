import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAccess } from '../app/AccessContext';
import { useSession } from '../app/SessionContext.jsx';
import { PLANS, USER_MODES, WORKSPACE_TYPES } from '../app/access.js';
import Avatar from '../components/ui/Avatar';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { cx } from '../utils/cx';
import { ThemeSelector } from '../features/theme';
import { useVoicePreference } from '../features/uni-voice-tts';
import { getPasswordResetRequestFeedback } from '../features/auth-mobile/passwordRecoveryUtils.js';
import ComingSoonSection from './configuracoes/ComingSoonSection.jsx';
import MobilePushSettingsCard from '../features/mobile-push/MobilePushSettingsCard.jsx';
import ProfileEditModal from './configuracoes/ProfileEditModal.jsx';
import { getProfileDisplayName } from './configuracoes/profileFormUtils.js';
import { settingsMock } from './configuracoes/settings.mock.js';
import styles from './SettingsPage.module.css';

// UX3: valores canonicos de `?section=`, os mesmos usados pelo AccountMenu
// desktop (Topbar/AccountMenu.jsx) e pelo MORE_MENU_ROUTES mobile
// (shellRoutes.js) -- um unico vocabulario de secoes em todo o app.
const SECTION_IDS = Object.freeze({
  perfil: 'section-perfil',
  preferencias: 'section-preferencias',
  seguranca: 'section-seguranca',
});

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
  const { isLoading, isSupabaseConfigured, profile, refreshSession, requestPasswordReset, user } = useSession();
  const settings = getSettingsContext(access.currentWorkspace);
  const showSpaces = access.currentWorkspace === WORKSPACE_TYPES.BUSINESS || access.userMode === USER_MODES.BOTH;
  const currentModeLabel = USER_MODE_LABELS[access.userMode];
  const currentPlanLabel = PLAN_LABELS[access.plan];

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileJustSaved, setProfileJustSaved] = useState(false);
  const [searchParams] = useSearchParams();
  const [isRequestingReset, setIsRequestingReset] = useState(false);
  const [resetFeedback, setResetFeedback] = useState(null);
  const voicePreference = useVoicePreference();

  const profileDisplayName = getProfileDisplayName(profile, user);
  const profileEmail = user?.email ?? '';
  const profilePhone = profile?.phone;

  // Rola ate a secao pedida por `?section=` e da foco+destaque temporario a
  // ela (destino coerente para o menu de conta desktop + itens Perfil/
  // Configuracoes/Seguranca do mobile). Chave no valor do parametro (nao no
  // objeto searchParams) para tambem re-rolar quando o usuario clica em
  // outra opcao do AccountMenu enquanto ja esta em /configuracoes, sem
  // reescrever a URL (sem risco de loop de navegacao). Parametro ausente ou
  // invalido: nenhum efeito, pagina renderiza normalmente do topo.
  // Destaque aplicado imperativamente via classList (nunca setState dentro
  // do efeito) e removido sozinho no fim da animacao CSS (animationend),
  // sem setTimeout arbitrario.
  const requestedSection = searchParams.get('section');

  useEffect(() => {
    const targetId = SECTION_IDS[requestedSection];
    if (!targetId) return;

    const target = document.getElementById(targetId);
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.focus({ preventScroll: true });

    target.classList.add(styles.sectionHighlighted);
    const clearHighlight = () => target.classList.remove(styles.sectionHighlighted);
    target.addEventListener('animationend', clearHighlight, { once: true });
    return () => target.removeEventListener('animationend', clearHighlight);
  }, [requestedSection]);

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

  // Reaproveita o mesmo fluxo real de recuperacao de senha ja usado pela
  // tela de login (AUTH1: requestPasswordReset via useSession() +
  // getPasswordResetRequestFeedback) -- nenhuma logica nova de envio de
  // e-mail, so uma segunda entrada para a mesma acao real, agora a partir de
  // uma conta ja autenticada. Mensagem sempre neutra, nunca revela se
  // houve falha tecnica especifica.
  async function handleRequestPasswordReset() {
    if (!canEditProfile || isRequestingReset) return;

    setIsRequestingReset(true);
    setResetFeedback(null);
    try {
      const { error } = await requestPasswordReset(profileEmail);
      setResetFeedback(getPasswordResetRequestFeedback(error));
    } finally {
      setIsRequestingReset(false);
    }
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

      <section
        id={SECTION_IDS.perfil}
        tabIndex={-1}
        className={styles.profileGrid}
        aria-label="Perfil"
      >
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
      </section>

      <section
        id={SECTION_IDS.preferencias}
        tabIndex={-1}
        className={styles.preferencesGrid}
        aria-label="Preferências"
      >
        <ThemeSelector />

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

        <ComingSoonSection
          title="Preferências da Uni"
          description="Como a Uni deve orientar sem aumentar esforço mental."
          message="Personalização de tom, explicações e alertas estará disponível em uma próxima etapa."
        />

        <Card variant="outline" padding="lg" className={styles.spacesCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Voz das respostas</h3>
              <p>Controla se as respostas da Uni no chat podem ser ouvidas em voz alta.</p>
            </div>
          </div>
          <label className={styles.voiceToggleRow} htmlFor="voice-preference-toggle">
            <input
              id="voice-preference-toggle"
              type="checkbox"
              role="switch"
              aria-checked={voicePreference.enabled}
              checked={voicePreference.enabled}
              onChange={(event) => voicePreference.setEnabled(event.target.checked)}
            />
            <span>
              Permitir voz nas respostas da Uni
              <small>Nunca toca sozinha — você sempre escolhe quando ouvir cada resposta.</small>
            </span>
          </label>
        </Card>

        <ComingSoonSection
          title="Voz e interação"
          description="Recursos para conversar com a Uni por voz."
          message="Configurações de voz e interação ainda não estão disponíveis nesta tela."
        />

        <MobilePushSettingsCard />

        <ComingSoonSection
          title="Notificações"
          description="A Uni só deve interromper quando houver valor real."
          message="Lembretes automáticos da Agenda ainda não estão disponíveis — esta é só a base técnica."
        />
      </section>

      <section
        id={SECTION_IDS.seguranca}
        tabIndex={-1}
        className={styles.securityGrid}
        aria-label="Segurança"
      >
        <Card variant="default" padding="lg" className={styles.settingsCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Segurança</h3>
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

          {/* Ainda sem modulo completo de seguranca (2FA, sessoes ativas) --
              em vez de um controle falso, reaproveita o fluxo real de
              redefinicao de senha ja usado no login (AUTH1), a unica acao de
              seguranca que hoje existe de verdade para uma conta logada. */}
          <div className={styles.settingRow}>
            <span>
              Enviamos um link de redefinição de senha para o seu e-mail cadastrado.
              Autenticação em duas etapas e sessões ativas ainda não estão disponíveis.
            </span>
            <Button
              variant="secondary"
              disabled={!canEditProfile || isRequestingReset}
              title={!canEditProfile ? getEditProfileTitle() : undefined}
              onClick={() => void handleRequestPasswordReset()}
            >
              {isRequestingReset ? 'Enviando...' : 'Redefinir senha'}
            </Button>
          </div>

          {resetFeedback ? (
            <p role={resetFeedback.tone === 'alert' ? 'alert' : 'status'} className="uf-text-caption">
              {resetFeedback.message}
            </p>
          ) : null}
        </Card>
      </section>

      <section className={styles.guidanceGrid} aria-label="Leitura da Uni">
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
