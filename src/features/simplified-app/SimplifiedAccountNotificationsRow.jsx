import IconBox from '../../components/ui/IconBox/index.js';
import { cx } from '../../utils/cx.js';
import { ACCOUNT_SUBROUTES, ACCOUNT_SUBROUTE_IDS } from './simplifiedAccountRoutes.js';
import { useSimplifiedNotifications } from './simplifiedNotificationsContext.js';
import { PhBellIcon, PhCaretRightIcon } from './SimplifiedIcons.jsx';
import { useNavegar } from './movimentoDeTelaContext.js';
import groups from './simplifiedGroups.module.css';
import styles from './simplifiedAccount.module.css';

/**
 * Fase 3 do redesign (#90): linha "Notificações" do grupo Produto do Mais
 * (tela 07). Mostra quantas estão por ler e abre a página de notificações
 * (tela 13). A ativação do push no aparelho mora dentro dessa página,
 * no mesmo aviso usado pelo painel do sino.
 */
function SimplifiedAccountNotificationsRow() {
  const navigate = useNavegar();
  // Estado publicado pelo SimplifiedAppShell (uma só busca da lista).
  const { unreadCount } = useSimplifiedNotifications();

  const subtitle = unreadCount > 0
    ? `${unreadCount} não lida${unreadCount > 1 ? 's' : ''}`
    : 'Tudo em dia';

  return (
    <button
      type="button"
      className={cx(groups.row, styles.menuRow)}
      onClick={() => navigate(ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.NOTIFICATIONS].path)}
    >
      <IconBox><PhBellIcon /></IconBox>
      <span className={groups.rowText}>
        <span className={groups.rowTitle}>Notificações</span>
        <span className={groups.rowSubtitle}>{subtitle}</span>
      </span>
      <span className={groups.caret} aria-hidden="true"><PhCaretRightIcon /></span>
    </button>
  );
}

export default SimplifiedAccountNotificationsRow;
