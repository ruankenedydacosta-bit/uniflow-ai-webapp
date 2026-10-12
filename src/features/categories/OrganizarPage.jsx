import { useSession } from '../../app/SessionContext';
import IconBox from '../../components/ui/IconBox';
import { useAccounts } from '../../hooks';
import { PhCaretRightIcon, PhTagIcon, PhWalletIcon } from '../simplified-app/SimplifiedIcons.jsx';
import SimplifiedSubpageHeader from '../simplified-app/SimplifiedSubpageHeader.jsx';
import { useNavegar } from '../simplified-app/movimentoDeTelaContext.js';
import { ACCOUNT_SUBROUTE_IDS, ACCOUNT_SUBROUTES } from '../simplified-app/simplifiedAccountRoutes.js';
import { SIMPLIFIED_ROUTES } from '../simplified-app/simplifiedRoutes.js';
import { useCategoriasOrganizar } from './useCategoriasOrganizar.js';
import styles from './organizar.module.css';

const SEM_REGISTROS = Object.freeze([]);

function plural(quantidade, singular, pluralForma) {
  return `${quantidade} ${quantidade === 1 ? singular : pluralForma}`;
}

// Hub Organizar (handoff 10a): Contas e Categorias numa tela só.
export default function OrganizarPage() {
  const navigate = useNavegar();
  const { workspace } = useSession();
  const { categoryState } = useCategoriasOrganizar();
  const accountState = useAccounts({
    workspaceId: workspace?.id,
    fallbackAccounts: SEM_REGISTROS,
    fallbackAccountTypes: SEM_REGISTROS,
  });

  const categorias = categoryState.categories.filter((c) => c.is_active !== false);
  const criadas = categorias.filter((c) => c.workspace_id && c.is_system !== true).length;
  const dicaDeCategorias = [
    plural(categorias.length, 'categoria', 'categorias'),
    criadas > 0 ? plural(criadas, 'criada por você', 'criadas por você') : null,
  ].filter(Boolean).join(' · ');

  const linhas = [
    {
      id: 'contas',
      Icon: PhWalletIcon,
      titulo: 'Contas',
      dica: plural(accountState.accounts.length, 'conta', 'contas'),
      para: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.MY_ACCOUNTS].path,
    },
    {
      id: 'categorias',
      Icon: PhTagIcon,
      titulo: 'Categorias',
      dica: dicaDeCategorias,
      para: SIMPLIFIED_ROUTES.CATEGORIAS,
    },
  ];

  return (
    <div className={styles.page}>
      <SimplifiedSubpageHeader title="Organizar" onBack={() => navigate(SIMPLIFIED_ROUTES.RECORDS)} />
      <div className={styles.body}>
        <p className={styles.lead}>
          Crie e ajuste onde seu dinheiro fica e como os lançamentos são agrupados.
        </p>
        <div className={styles.hubList}>
          {linhas.map(({ id, Icon, titulo, dica, para }) => (
            <button key={id} type="button" className={styles.hubRow} onClick={() => navigate(para)}>
              <IconBox><Icon /></IconBox>
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>{titulo}</span>
                <span className={styles.rowHint}>{dica}</span>
              </span>
              <span className={styles.caret} aria-hidden="true"><PhCaretRightIcon /></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
