import { UNI_RING_ORB_STATES } from '../../../components/ui/UniRingOrb/uniRingOrbModel.js';
import OutlineButton from '../../../components/ui/OutlineButton/index.js';
import AnalyticsConsentPreferencesModal from '../../../features/analytics/AnalyticsConsentPreferencesModal.jsx';
import CategoryCreateModal from '../../../features/categories/components/CategoryCreateModal.jsx';
import PersonalPlanPage, { PixPaymentModal, SubscriptionMethodModal } from '../../../features/personal-plan/PersonalPlanPage.jsx';
import PlanResultScreen from '../../../features/personal-plan/PlanResultScreen.jsx';
import { findPersonalPlanTier } from '../../../features/personal-plan/personalPlanConfig.js';
import PresentationCarousel from '../../../features/presentation/PresentationCarousel.jsx';
import presentationStyles from '../../../features/presentation/Presentation.module.css';
import PwaInstallExperience from '../../../features/pwa-install/PwaInstallExperience.jsx';
import PwaIosInstallGuide from '../../../features/pwa-install/PwaIosInstallGuide.jsx';
import AgendaReminderChoiceModal from '../../../features/simplified-app/AgendaReminderChoiceModal.jsx';
import MonthPickerModal from '../../../features/simplified-app/MonthPickerModal.jsx';
import SimplifiedAgendaFormModal from '../../../features/simplified-app/SimplifiedAgendaFormModal.jsx';
import UpdateBalanceModal from '../../../features/simplified-app/UpdateBalanceModal.jsx';
import appStyles from '../../../features/simplified-app/simplifiedApp.module.css';
import AgendaDeleteConfirmModal from '../../agenda/AgendaDeleteConfirmModal.jsx';

// Telas 21 (primeiro acesso) e 22 (modais e avisos) do handoff com dados de
// exemplo, para comparar em 390px sem sessão. Só em desenvolvimento.
// ?tela=apresentacao | plano | assinar | pix | resultado&r=... | modal&m=...

const NOOP = () => {};
const TIER = findPersonalPlanTier('uni_voz');
const PIX_DATA = { value: 29.9, payload: '00020126580014br.gov.bcb.pix', encoded_image: null };

const AGENDA_ITEM = {
  id: 'demo-agenda-item',
  title: 'Dentista',
  description: 'Dra. Paula · Av. Paulista',
  item_type: 'appointment',
  starts_at: new Date(2026, 9, 23, 8, 30).toISOString(),
  ends_at: null,
  is_all_day: false,
  has_explicit_time: true,
  updated_at: new Date(2026, 9, 10).toISOString(),
};

const AGENDA_STATE = {
  isMutating: false,
  createItem: async () => ({ error: null }),
  updateItem: async () => ({ error: null }),
  removeItem: async () => ({ error: null }),
  refresh: async () => {},
};

const RESULTS = {
  confirmado: {
    orbState: UNI_RING_ORB_STATES.SPEAKING,
    title: 'Pagamento confirmado',
    description: 'Seu Plano Pessoal está ativo. Você tem 60 minutos de conversa por voz por mês.',
    action: <OutlineButton>Ir para o início</OutlineButton>,
  },
  processando: {
    orbState: UNI_RING_ORB_STATES.THINKING,
    title: 'Processando seu pagamento',
    description: 'Esta tela atualiza sozinha quando o Asaas confirmar o pagamento.',
    action: null,
  },
  'nao-concluido': {
    orbState: UNI_RING_ORB_STATES.IDLE,
    title: 'Pagamento não concluído',
    description: 'Nenhuma cobrança foi feita. Você pode tentar de novo quando quiser.',
    action: <OutlineButton variant="secondary">Voltar ao Plano Pessoal</OutlineButton>,
  },
};

function AppBackdrop({ children }) {
  return (
    <div className={appStyles.shell} data-simplified-app-shell>
      <div className={appStyles.shellSurface}>
        <main className={appStyles.mainContent}>
          <div className={appStyles.home}>{children}</div>
        </main>
      </div>
    </div>
  );
}

function ModalPreview({ name }) {
  if (name === 'saldo') {
    return <UpdateBalanceModal open target="balance" currentValue={1980} onClose={NOOP} onChanged={NOOP} />;
  }
  if (name === 'mes') {
    return <MonthPickerModal open initialDate={new Date(2026, 9, 1)} onApply={NOOP} onClose={NOOP} />;
  }
  if (name === 'compromisso' || name === 'novo-compromisso') {
    return (
      <SimplifiedAgendaFormModal
        item={name === 'compromisso' ? AGENDA_ITEM : null}
        defaultDay={new Date(2026, 9, 23)}
        agenda={AGENDA_STATE}
        userId="demo-user"
        workspaceId="demo-workspace"
        onClose={NOOP}
        onRequestDelete={NOOP}
      />
    );
  }
  if (name === 'lembrete') return <AgendaReminderChoiceModal item={AGENDA_ITEM} onClose={NOOP} />;
  if (name === 'excluir') return <AgendaDeleteConfirmModal item={AGENDA_ITEM} agenda={AGENDA_STATE} onClose={NOOP} />;
  if (name === 'categoria') {
    return (
      <CategoryCreateModal
        open
        onClose={NOOP}
        defaultType="expense"
        categories={[]}
        onCreate={NOOP}
        isMutating={false}
        serverError=""
      />
    );
  }
  if (name === 'privacidade') return <AnalyticsConsentPreferencesModal open onClose={NOOP} />;
  if (name === 'iphone') return <PwaIosInstallGuide open onClose={NOOP} inSafari />;
  return null;
}

function FirstAccessPreview({ screen, variant }) {
  if (screen === 'apresentacao') {
    return (
      <main className={presentationStyles.presentationPage}>
        <PresentationCarousel onComplete={NOOP} />
      </main>
    );
  }
  if (screen === 'plano') return <PersonalPlanPage />;
  if (screen === 'assinar') {
    return (
      <>
        <PersonalPlanPage />
        <SubscriptionMethodModal open onClose={NOOP} onConfirm={NOOP} isSubmitting={false} submitError={null} tier={TIER} />
      </>
    );
  }
  if (screen === 'pix') {
    return (
      <>
        <PersonalPlanPage />
        <PixPaymentModal open onClose={NOOP} pixData={PIX_DATA} tier={TIER} />
      </>
    );
  }
  if (screen === 'resultado') {
    return <PlanResultScreen {...(RESULTS[variant] ?? RESULTS.confirmado)} />;
  }
  if (screen === 'instalar') {
    return (
      <AppBackdrop>
        <PwaInstallExperience />
      </AppBackdrop>
    );
  }
  return (
    <AppBackdrop>
      <ModalPreview name={variant} />
    </AppBackdrop>
  );
}

export default FirstAccessPreview;
