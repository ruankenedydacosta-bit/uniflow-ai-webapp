import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSession } from '../app/SessionContext';
import Modal from '../components/ui/Modal/Modal.jsx';
import OutlineButton from '../components/ui/OutlineButton/index.js';
import UniCard from '../components/ui/UniCard/index.js';
import { useGoals } from '../features/goals/useGoals';
import GoalContributionSheet from '../features/goals/components/GoalContributionSheet';
import GoalForm from '../features/goals/components/GoalForm';
import GoalMilestoneCelebration from '../features/goals/components/GoalMilestoneCelebration';
import { AnelDeProgresso } from '../features/goals/components/GoalListCard';
import { mensagemDoErroAoExcluir, MOVIMENTOS } from '../features/goals/aporteDaMeta.js';
import { calcProgress } from '../features/goals/goalCalc.js';
import { celebracaoDoMarco, marcoCruzado } from '../features/goals/marcoDaMeta.js';
import { listContributions } from '../features/goals/goalService';
import { FINANCIAL_DATA_CHANGED_EVENT, notifyFinancialDataChanged } from '../services/financialDataEvents.js';
import { dataDoAporte, numerosDaMeta, precisaDeAjuste, previsaoDaUni } from '../features/goals/detalheDaMeta.js';
import { linhaDeApoio, seloDaMeta } from '../features/goals/listaDeMetas.js';
import SimplifiedConfirmModal from '../features/simplified-app/SimplifiedConfirmModal.jsx';
import { PhDotsThreeIcon } from '../features/simplified-app/SimplifiedIcons.jsx';
import SimplifiedSubpageHeader from '../features/simplified-app/SimplifiedSubpageHeader.jsx';
import { useNavegar } from '../features/simplified-app/movimentoDeTelaContext.js';
import { SIMPLIFIED_ROUTES } from '../features/simplified-app/simplifiedRoutes.js';
import { cx } from '../utils/cx.js';
import { formatCurrency } from '../utils/formatters';
import listaStyles from './ObjetivosPage.module.css';
import styles from './MetaDetalhePage.module.css';

// Detalhe da meta (handoff 08e, #157): anel, números do plano, ações,
// previsão da Uni e aportes. O menu ⋯ guarda Editar, Retirar, Pausar,
// Concluir e Excluir. Aporte e retirada abrem a mesma folha (#158); tocar
// num aporte da lista oferece excluí-lo. Ajustar plano abre a edição até a
// folha própria (#159) existir.
export default function MetaDetalhePage() {
  const { id } = useParams();
  const navigate = useNavegar();
  const { workspace } = useSession();
  const { goals, isLoading, error, refresh, editGoal, removeGoal, addGoalContribution, removeGoalContribution } = useGoals({ workspaceId: workspace?.id });

  const [aportes, setAportes] = useState([]);
  const [carregandoAportes, setCarregandoAportes] = useState(true);
  const [erroDosAportes, setErroDosAportes] = useState(null);
  const [menuAberto, setMenuAberto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [movimento, setMovimento] = useState(null);
  const [aporteParaExcluir, setAporteParaExcluir] = useState(null);
  const [excluindoAporte, setExcluindoAporte] = useState(false);
  const [erroAoExcluirAporte, setErroAoExcluirAporte] = useState(null);
  const [confirmacao, setConfirmacao] = useState(null);
  const [processando, setProcessando] = useState(false);
  const [erroDaConfirmacao, setErroDaConfirmacao] = useState(null);
  const [erroDaAcao, setErroDaAcao] = useState(null);
  const [metaExcluida, setMetaExcluida] = useState(null);
  const [celebracao, setCelebracao] = useState(null);
  const tituloDosAportesId = useId();

  // Depois de excluir, a meta sai de `goals` antes de a navegação terminar.
  // A cópia mantém o detalhe na tela durante a saída, em vez do aviso de
  // meta inexistente.
  const meta = goals.find((goal) => goal.id === id) ?? metaExcluida;
  // Meta concluída volta para a aba de onde foi aberta.
  const voltar = () => navigate(meta?.status === 'completed' ? `${SIMPLIFIED_ROUTES.METAS}?aba=concluidas` : SIMPLIFIED_ROUTES.METAS);

  const carregarAportes = useCallback(async () => {
    const resultado = await listContributions(id);
    setAportes(resultado.data ?? []);
    setErroDosAportes(resultado.error ? 'Não foi possível carregar os aportes.' : null);
    setCarregandoAportes(false);
  }, [id]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => carregarAportes(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [carregarAportes]);

  // Aporte registrado pela Uni enquanto a tela está aberta: o useGoals
  // recarrega a meta, e a lista de aportes acompanha.
  useEffect(() => {
    function recarregar() { carregarAportes(); }
    window.addEventListener(FINANCIAL_DATA_CHANGED_EVENT, recarregar);
    return () => window.removeEventListener(FINANCIAL_DATA_CHANGED_EVENT, recarregar);
  }, [carregarAportes]);

  const previsao = useMemo(() => (meta ? previsaoDaUni(meta, aportes) : null), [meta, aportes]);

  if (!meta) {
    return (
      <div className={listaStyles.page}>
        <SimplifiedSubpageHeader title="Meta" onBack={voltar} backLabel="Voltar para Metas" />
        {isLoading ? (
          <p className={listaStyles.state} role="status">Carregando meta…</p>
        ) : (
          <div className={listaStyles.state}>
            <p>{error ? 'Não foi possível carregar a meta.' : 'Esta meta não existe mais.'}</p>
            {error ? <OutlineButton variant="secondary" onClick={() => refresh()}>Tentar novamente</OutlineButton> : null}
          </div>
        )}
      </div>
    );
  }

  const progresso = calcProgress(Number(meta.current_amount || 0), Number(meta.target_amount || 0));
  const selo = seloDaMeta(meta);
  const numeros = numerosDaMeta(meta);
  const ativa = meta.status === 'active';
  const pausada = meta.status === 'paused';
  const concluida = meta.status === 'completed';
  const alcancada = !concluida && numeros.falta <= 0;

  async function salvarEdicao(values) {
    return editGoal(meta.id, values);
  }

  async function alternarPausa() {
    setMenuAberto(false);
    setErroDaAcao(null);
    const resultado = await editGoal(meta.id, { status: pausada ? 'active' : 'paused' });
    if (resultado?.error) setErroDaAcao(pausada ? 'Não foi possível retomar a meta. Tente de novo.' : 'Não foi possível pausar a meta. Tente de novo.');
  }

  function pedirConfirmacao(tipo) {
    setMenuAberto(false);
    setErroDaConfirmacao(null);
    setConfirmacao(tipo);
  }

  async function confirmar() {
    if (processando) return;
    setProcessando(true);
    const concluir = confirmacao === 'concluir';
    if (!concluir) setMetaExcluida(meta);
    const resultado = concluir
      ? await editGoal(meta.id, { status: 'completed', completed_at: new Date().toISOString() })
      : await removeGoal(meta.id);
    setProcessando(false);
    if (resultado?.error) {
      setMetaExcluida(null);
      setErroDaConfirmacao(concluir ? 'Não foi possível concluir a meta. Tente de novo.' : 'Não foi possível excluir a meta. Tente de novo.');
      return;
    }
    setConfirmacao(null);
    navigate(concluir ? `${SIMPLIFIED_ROUTES.METAS}?aba=concluidas` : SIMPLIFIED_ROUTES.METAS);
  }

  async function registrarMovimento(values) {
    const resultado = await addGoalContribution(meta.id, values);
    if (resultado?.error) return resultado;
    setMovimento(null);
    // Aporte que passa de 50% ou de 100% abre a celebração (#147).
    const depois = resultado?.data?.meta
      ? { ...meta, ...resultado.data.meta }
      : { ...meta, current_amount: Number(meta.current_amount || 0) + Number(values.amount) };
    const marco = marcoCruzado({ antes: Number(meta.current_amount || 0), depois: depois.current_amount, alvo: meta.target_amount });
    if (marco) setCelebracao(celebracaoDoMarco(depois, marco));
    // A transferência lançada junto muda saldos e lista do Financeiro; o
    // aviso também recarrega os aportes desta tela.
    notifyFinancialDataChanged('meta-aporte');
    return resultado;
  }

  function abrirMovimento(tipo) {
    setMenuAberto(false);
    setMovimento(tipo);
  }

  function pedirExclusaoDoAporte(aporte) {
    setErroAoExcluirAporte(null);
    setAporteParaExcluir(aporte);
  }

  async function excluirAporte() {
    if (excluindoAporte) return;
    setExcluindoAporte(true);
    const resultado = await removeGoalContribution(meta.id, aporteParaExcluir.id, aporteParaExcluir.amount);
    setExcluindoAporte(false);
    if (resultado?.error) {
      setErroAoExcluirAporte(mensagemDoErroAoExcluir(resultado.error));
      return;
    }
    setAporteParaExcluir(null);
    notifyFinancialDataChanged('meta-aporte');
  }

  return (
    <div className={listaStyles.page} data-simplified-goal>
      <SimplifiedSubpageHeader
        title={meta.name}
        onBack={voltar}
        backLabel="Voltar para Metas"
        action={(
          <button type="button" className={listaStyles.headerAction} onClick={() => setMenuAberto(true)} aria-label="Mais ações da meta">
            <PhDotsThreeIcon />
          </button>
        )}
      />

      <section className={styles.hero} aria-label="Progresso da meta">
        <AnelDeProgresso progresso={progresso} tom={selo?.tom} className={styles.ring} />
        <div className={styles.heroText}>
          {selo ? <span className={cx(styles.selo, styles[selo.tom])}>{selo.rotulo}</span> : null}
          <strong className={styles.saved}>{formatCurrency(numeros.guardado)}</strong>
          <span className={styles.ofTarget}>{`de ${formatCurrency(meta.target_amount)}`}</span>
        </div>
      </section>

      {concluida || alcancada ? <p className={styles.support}>{linhaDeApoio(meta)}</p> : null}

      <dl className={styles.numbers}>
        <div>
          <dt>Falta</dt>
          <dd>{formatCurrency(numeros.falta)}</dd>
        </div>
        <div>
          <dt>Por mês</dt>
          <dd>{numeros.porMes ? formatCurrency(numeros.porMes) : '—'}</dd>
        </div>
        <div>
          <dt>Data</dt>
          <dd>{numeros.data ?? 'Sem data'}</dd>
        </div>
      </dl>

      {erroDaAcao ? <p className={styles.error} role="alert">{erroDaAcao}</p> : null}

      {ativa || pausada ? (
        <div className={styles.actions}>
          {alcancada ? (
            <OutlineButton onClick={() => pedirConfirmacao('concluir')}>Concluir meta</OutlineButton>
          ) : null}
          {ativa && !alcancada ? (
            <OutlineButton onClick={() => abrirMovimento(MOVIMENTOS.APORTE)}>Registrar aporte</OutlineButton>
          ) : null}
          {pausada ? <OutlineButton onClick={alternarPausa}>Retomar meta</OutlineButton> : null}
          {precisaDeAjuste(meta) ? (
            <OutlineButton variant="secondary" onClick={() => setEditando(true)}>Ajustar plano</OutlineButton>
          ) : null}
        </div>
      ) : null}

      {previsao ? (
        <UniCard aria-label="Previsão da Uni">
          <p>{previsao}</p>
        </UniCard>
      ) : null}

      <section className={styles.contributions} aria-labelledby={tituloDosAportesId}>
        <h2 id={tituloDosAportesId} className={styles.sectionTitle}>Aportes</h2>
        {carregandoAportes ? (
          <p className={styles.empty} role="status">Carregando aportes…</p>
        ) : erroDosAportes ? (
          <p className={styles.error} role="alert">{erroDosAportes}</p>
        ) : aportes.length === 0 ? (
          <p className={styles.empty}>Nenhum aporte registrado.</p>
        ) : (
          <ul className={styles.contributionList}>
            {aportes.map((aporte) => {
              const retirada = Number(aporte.amount) < 0;
              const conteudo = (
                <>
                  <span className={styles.contributionText}>
                    <span>{retirada ? `${dataDoAporte(aporte.contribution_date)} · Retirada` : dataDoAporte(aporte.contribution_date)}</span>
                    {aporte.note ? <span className={styles.contributionNote}>{aporte.note}</span> : null}
                  </span>
                  <strong className={styles.contributionAmount}>
                    {retirada ? `−${formatCurrency(Math.abs(aporte.amount))}` : formatCurrency(aporte.amount)}
                  </strong>
                </>
              );
              // Meta concluída não muda de valor: a lista fica só para leitura.
              return (
                <li key={aporte.id}>
                  {concluida ? (
                    <div className={styles.contribution}>{conteudo}</div>
                  ) : (
                    <button
                      type="button"
                      className={styles.contribution}
                      onClick={() => pedirExclusaoDoAporte(aporte)}
                      aria-label={`${retirada ? 'Retirada' : 'Aporte'} de ${formatCurrency(Math.abs(aporte.amount))} em ${dataDoAporte(aporte.contribution_date)}. Tocar para excluir.`}
                    >
                      {conteudo}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Modal open={menuAberto} onClose={() => setMenuAberto(false)} title={meta.name} size="sm">
        <div className={listaStyles.sheetActions}>
          {!concluida ? (
            <>
              <OutlineButton variant="secondary" onClick={() => { setMenuAberto(false); setEditando(true); }}>Editar meta</OutlineButton>
              {(ativa || pausada) && numeros.guardado > 0 ? (
                <OutlineButton variant="secondary" onClick={() => abrirMovimento(MOVIMENTOS.RETIRADA)}>Retirar da meta</OutlineButton>
              ) : null}
              <OutlineButton variant="secondary" onClick={alternarPausa}>{pausada ? 'Retomar meta' : 'Pausar meta'}</OutlineButton>
              <OutlineButton variant="secondary" onClick={() => pedirConfirmacao('concluir')}>Concluir meta</OutlineButton>
            </>
          ) : null}
          <OutlineButton variant="ghost" onClick={() => pedirConfirmacao('excluir')}>Excluir meta</OutlineButton>
        </div>
      </Modal>

      <SimplifiedConfirmModal
        open={Boolean(confirmacao)}
        onClose={() => { if (!processando) setConfirmacao(null); }}
        title={confirmacao === 'concluir' ? 'Concluir a meta?' : 'Excluir a meta?'}
        description={confirmacao === 'concluir'
          ? `"${meta.name}" vai para Concluídas e para de receber aportes.`
          : [
            `"${meta.name}" e os aportes registrados nela serão apagados.`,
            aportes.some((aporte) => aporte.transaction_id) ? 'As transferências lançadas no Financeiro continuam lá.' : '',
          ].join(' ').trim()}
        confirmLabel={confirmacao === 'concluir' ? 'Concluir meta' : 'Excluir meta'}
        onConfirm={confirmar}
        loading={processando}
        error={erroDaConfirmacao}
      />

      {editando ? (
        <GoalForm open onClose={() => setEditando(false)} goal={meta} onSave={salvarEdicao} />
      ) : null}

      <SimplifiedConfirmModal
        open={Boolean(aporteParaExcluir)}
        onClose={() => { if (!excluindoAporte) setAporteParaExcluir(null); }}
        title={Number(aporteParaExcluir?.amount) < 0 ? 'Excluir a retirada?' : 'Excluir o aporte?'}
        description={aporteParaExcluir ? [
          `${formatCurrency(Math.abs(aporteParaExcluir.amount))} de ${dataDoAporte(aporteParaExcluir.contribution_date)} sai da meta.`,
          aporteParaExcluir.transaction_id ? 'A transferência lançada no Financeiro também será excluída.' : '',
        ].join(' ').trim() : ''}
        confirmLabel="Excluir"
        onConfirm={excluirAporte}
        loading={excluindoAporte}
        error={erroAoExcluirAporte}
      />

      {movimento ? (
        <GoalContributionSheet
          meta={meta}
          movimento={movimento}
          onClose={() => setMovimento(null)}
          onSave={registrarMovimento}
        />
      ) : null}

      {celebracao ? (
        <GoalMilestoneCelebration celebracao={celebracao} onClose={() => setCelebracao(null)} />
      ) : null}
    </div>
  );
}
