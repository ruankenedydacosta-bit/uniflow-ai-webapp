import { useAccess } from '../app/AccessContext';
import { PLANS, USER_MODES, WORKSPACE_TYPES } from '../app/access.js';
import Avatar from '../components/ui/Avatar';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { cx } from '../utils/cx';
import { ThemeSelector } from '../features/theme';
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
  const settings = getSettingsContext(access.currentWorkspace);
  const showSpaces = access.currentWorkspace === WORKSPACE_TYPES.BUSINESS || access.userMode === USER_MODES.BOTH;
  const currentModeLabel = USER_MODE_LABELS[access.userMode];
  const currentPlanLabel = PLAN_LABELS[access.plan];

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
          <Button>Editar perfil</Button>
          <Button variant="secondary">Perguntar à Uni</Button>
        </div>
      </section>

      <section className={styles.profileGrid} aria-label="Perfil e modo de uso">
        <Card variant="glass" padding="lg" className={styles.profileCard}>
          <div className={styles.profileHeader}>
            <Avatar name={settingsMock.profile.name} size="lg" status="online" />
            <div>
              <span className={styles.eyebrow}>Perfil</span>
              <h3>{settingsMock.profile.name}</h3>
              <p>{settingsMock.profile.email}</p>
            </div>
          </div>

          <div className={styles.profileDetails}>
            <div>
              <span>Tipo de conta</span>
              <strong>{currentModeLabel}</strong>
            </div>
            <div>
              <span>Plano atual</span>
              <strong>{currentPlanLabel}</strong>
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
        <Card variant="default" padding="lg" className={styles.settingsCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Preferências da Uni</h3>
              <p>Como a Uni deve orientar sem aumentar esforço mental.</p>
            </div>
          </div>
          <div className={styles.settingList}>
            {settingsMock.uniPreferences.map((preference) => (
              <div key={preference.label} className={styles.settingRow}>
                <span>{preference.label}</span>
                <strong>{preference.value}</strong>
              </div>
            ))}
          </div>
        </Card>

        <Card variant="default" padding="lg" className={styles.settingsCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Voz e interação</h3>
              <p>Recursos locais e futuros para conversar com a Uni.</p>
            </div>
          </div>
          <div className={styles.badgeList}>
            {settingsMock.voiceInteraction.map((item) => (
              <div key={item.label} className={styles.badgeRow}>
                <span>{item.label}</span>
                <Badge variant={item.variant} size="sm">
                  {item.value}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card variant="default" padding="lg" className={styles.settingsCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Notificações</h3>
              <p>A Uni só deve interromper quando houver valor real.</p>
            </div>
          </div>
          <div className={styles.dotList}>
            {settingsMock.notifications.map((notification) => (
              <div key={notification} className={styles.dotItem}>
                <span aria-hidden="true" />
                <p>{notification}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card variant="default" padding="lg" className={styles.settingsCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Privacidade e segurança</h3>
              <p>Base para controle real com autenticação futura.</p>
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
              {settingsMock.spaces.map((space) => (
                <div key={space.label} className={styles.spaceItem}>
                  <Badge variant={space.variant} size="sm">
                    {space.label}
                  </Badge>
                  <p>{space.description}</p>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        <Card variant="glass" padding="lg" className={styles.uniCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Leitura da Uni</h3>
              <p>Configurações devem aumentar clareza, segurança e confiança.</p>
            </div>
            <Badge variant="glass" size="sm" dot>
              Uni
            </Badge>
          </div>
          <p>{settings.uniReading}</p>
        </Card>
      </section>
    </div>
  );
}

export default SettingsPage;
