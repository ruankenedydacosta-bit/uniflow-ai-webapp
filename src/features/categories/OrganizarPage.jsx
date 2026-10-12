import { useLocation } from 'react-router-dom';
import { useSession } from '../../app/SessionContext';
import IconBox from '../../components/ui/IconBox';
import { useAccounts, useCategories } from '../../hooks';
import { ehCartao } from '../contas/contasOrganizar.js';
import { PhCaretRightIcon, PhTagIcon, PhWalletIcon } from '../simplified-app/SimplifiedIcons.jsx';
import SimplifiedSubpageHeader from '../simplified-app/SimplifiedSubpageHeader.jsx';
import { useNavegar } from '../simplified-app/movimentoDeTelaContext.js';
import { SIMPLIFIED_ROUTES } from '../simplified-app/simplifiedRoutes.js';
import styles from './organizar.module.css';

const SEM_REGISTROS = Object.freeze([]);

function plural(quantidade, singular, pluralForma) {
  return `${quantidade} ${quantidade === 1 ? singular : pluralForma}`;
}

// Hub Organizar (handoff 10a): Contas e Categorias numa tela só.
export default function OrganizarPage() {
  const navigate = useNavegar();
  const location = useLocation();
  // Quem abre Organizar (Financeiro ou Mais) diz de onde veio, para a seta voltar lá.
  const origem = location.state?.de ?? SIMPLIFIED_ROUTES.RECORDS;
  const { workspace } = useSession();
  const categoryState = useCategories({ workspaceId: workspace?.id, context: 'personal' });
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

  // A lista de Contas separa cartões; o hub conta do mesmo jeito.
  const cartoes = accountState.activeAccounts.filter(ehCartao).length;
  const dicaDeContas = [
    plural(accountState.activeAccounts.length - cartoes, 'conta', 'contas'),
    cartoes > 0 ? plural(cartoes, 'cartão', 'cartões') : null,
  ].filter(Boolean).join(' · ');

  const linhas = [
    {
      id: 'contas',
      Icon: PhWalletIcon,
      titulo: 'Contas',
      dica: accountState.isLoading ? '' : dicaDeContas,
      para: SIMPLIFIED_ROUTES.CONTAS,
    },
    {
      id: 'categorias',
      Icon: PhTagIcon,
      titulo: 'Categorias',
      dica: categoryState.isLoading ? '' : dicaDeCategorias,
      para: SIMPLIFIED_ROUTES.CATEGORIAS,
    },
  ];

  return (
    <div className={styles.page}>
      <SimplifiedSubpageHeader title="Organizar" onBack={() => navigate(origem)} />
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
