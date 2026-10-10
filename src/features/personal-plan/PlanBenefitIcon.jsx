import {
  PhCalendarBlankIcon,
  PhChartBarIcon,
  PhChatCircleTextIcon,
  PhClockCounterClockwiseIcon,
  PhMicrophoneIcon,
  PhTagIcon,
} from '../simplified-app/SimplifiedIcons.jsx';

// Tela 21d: ícones Phosphor do app para cada recurso do plano.
const BENEFIT_ICONS = Object.freeze({
  voice: PhMicrophoneIcon,
  categories: PhTagIcon,
  uni: PhChatCircleTextIcon,
  agenda: PhCalendarBlankIcon,
  summary: PhChartBarIcon,
  history: PhClockCounterClockwiseIcon,
});

function PlanBenefitIcon({ type }) {
  const Icon = BENEFIT_ICONS[type] ?? PhChatCircleTextIcon;
  return <Icon />;
}

export default PlanBenefitIcon;
