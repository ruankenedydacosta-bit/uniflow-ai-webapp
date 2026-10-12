import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../app/SessionContext';
import FilterChips from '../components/ui/FilterChips/index.js';
import OutlineButton from '../components/ui/OutlineButton/index.js';
import ProgressBar from '../components/ui/ProgressBar/index.js';
import { useGoals } from '../features/goals/useGoals';
import GoalListCard from '../features/goals/components/GoalListCard';
import GoalCreateFlow from '../features/goals/components/GoalCreateFlow';
import GoalSuggestions from '../features/goals/components/GoalSuggestions';
import { ABAS_DE_METAS, resumirMetasAtivas, separarPorAba } from '../features/goals/listaDeMetas.js';
import { PhPlusIcon } from '../features/simplified-app/SimplifiedIcons.jsx';
import SimplifiedSubpageHeader from '../features/simplified-app/SimplifiedSubpageHeader.jsx';
import { useNavegar } from '../features/simplified-app/movimentoDeTelaContext.js';
import { metaPath, SIMPLIFIED_ROUTES } from '../features/simplified-app/simplifiedRoutes.js';
import { formatCurrency } from '../utils/formatters';
import styles from './ObjetivosPage.module.css';

const LISTA_VAZIA_POR_ABA = {
  ativas: 'Nenhuma meta ativa.',
  concluidas: 'Nenhuma meta concluída ainda.',
};

// `?aba=concluidas` abre direto em Concluídas: é para lá que o detalhe
// leva depois de concluir uma meta (#157).
function abaInicial(parametros) {
  const aba = parametros.get('aba');
  return ABAS_DE_METAS.some((opcao) => opcao.value === aba) ? aba : 'ativas';
}

// Lista de Metas (handoff 08a, #154). O toque no card abre o detalhe (#157).
export default function ObjetivosPage() {
  const navigate = useNavegar();
  const [parametros] = useSearchParams();
  const { workspace } = useSession();
  const { goals, isLoading, error, refresh, addGoal } = useGoals({ workspaceId: workspace?.id, comUltimoAporte: true });

  const [aba, setAba] = useState(() => abaInicial(parametros));
  // null fechada; { inicial } aberta, com inicial nulo ou vindo de uma sugestão.
  const [criacao, setCriacao] = useState(null);

  const { ativas, concluidas } = useMemo(() => separarPorAba(goals), [goals]);
  const resumo = useMemo(() => resumirMetasAtivas(goals), [goals]);
  const lista = aba === 'ativas' ? ativas : concluidas;

  // A meta nova entra no topo de Ativas (useGoals põe o registro novo na
  // frente da lista).
  async function handleCreate(values) {
    const result = await addGoal(values);
    if (!result?.error) {
      setCriacao(null);
      setAba('ativas');
      window.scrollTo({ top: 0 });
    }
    return result;
  }

  return (
    <div className={styles.page} data-simplified-goals>
      <SimplifiedSubpageHeader
        title="Metas"
        onBack={() => navigate(SIMPLIFIED_ROUTES.ACCOUNT)}
        backLabel="Voltar para Mais"
        action={(
          <button type="button" className={styles.headerAction} onClick={() => setCriacao({ inicial: null })} aria-label="Criar meta">
            <PhPlusIcon />
          </button>
        )}
      />

      {error && !isLoading ? (
        <div className={styles.errorBanner} role="alert">
          <p>{error.message || 'Não foi possível carregar as metas.'}</p>
          {goals.length === 0 ? (
            <OutlineButton variant="secondary" onClick={() => refresh()}>Tentar novamente</OutlineButton>
          ) : null}
        </div>
      ) : null}

      {isLoading && goals.length === 0 ? (
        <p className={styles.state} role="status">Carregando metas…</p>
      ) : goals.length === 0 ? (
        error ? null : (
          <GoalSuggestions onEscolher={(inicial) => setCriacao({ inicial })} />
        )
      ) : (
        <>
          {resumo.quantidade > 0 ? (
            <section className={styles.summary} aria-label="Resumo das metas ativas">
              <span className={styles.summaryLabel}>
                {resumo.quantidade === 1 ? 'Guardado em 1 meta' : `Guardado em ${resumo.quantidade} metas`}
              </span>
              <strong className={styles.summaryValue}>{formatCurrency(resumo.guardado)}</strong>
              <ProgressBar value={resumo.progresso} tone="green" />
              <span className={styles.summaryNote}>
                {`${resumo.progresso}% de ${formatCurrency(resumo.total)} no total.`}
              </span>
            </section>
          ) : null}

          <FilterChips label="Metas por situação" options={ABAS_DE_METAS} value={aba} onChange={setAba} />

          {lista.length === 0 ? (
            <p className={styles.state}>{LISTA_VAZIA_POR_ABA[aba]}</p>
          ) : (
            <ul className={styles.list}>
              {lista.map((goal) => (
                <li key={goal.id}>
                  <GoalListCard goal={goal} onOpen={(meta) => navigate(metaPath(meta.id))} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {criacao ? (
        <GoalCreateFlow inicial={criacao.inicial} onClose={() => setCriacao(null)} onCreate={handleCreate} />
      ) : null}
    </div>
  );
}
