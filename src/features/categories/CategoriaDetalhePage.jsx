import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import IconBox from '../../components/ui/IconBox';
import OutlineButton from '../../components/ui/OutlineButton';
import { notifyFinancialDataChanged } from '../../services/financialDataEvents.js';
import { formatCurrency } from '../../utils/formatters.js';
import SimplifiedSubpageHeader from '../simplified-app/SimplifiedSubpageHeader.jsx';
import { useNavegar } from '../simplified-app/movimentoDeTelaContext.js';
import { SIMPLIFIED_ROUTES } from '../simplified-app/simplifiedRoutes.js';
import { lancamentosDaCategoria, resumoDaCategoria } from './categoriasDoMes.js';
import { CATEGORY_TYPES, getCategoryErrorMessage } from './categoryUtils.js';
import { CategoryIcon } from './categoryIcons.jsx';
import CategoryCreateModal from './components/CategoryCreateModal.jsx';
import CategoryDeleteConfirmModal from './components/CategoryDeleteConfirmModal.jsx';
import { useCategoriasOrganizar } from './useCategoriasOrganizar.js';
import styles from './organizar.module.css';

function plural(quantidade, singular, pluralForma) {
  return `${quantidade} ${quantidade === 1 ? singular : pluralForma}`;
}

function formatarDia(data) {
  const [, mes, dia] = String(data).split('-');
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${Number(dia)} ${meses[Number(mes) - 1] ?? ''}`.trim();
}

// Detalhe da categoria (handoff 10c): total do mês, lançamentos e as ações.
// Editar e Excluir só aparecem em categoria do espaço, seguindo
// canManageCategory; nas padrão, a linha de baixo explica o motivo.
export default function CategoriaDetalhePage() {
  const { id } = useParams();
  const navigate = useNavegar();
  const { mes, categoryState, transactionState, podeCriar, podeGerenciar, carregando } = useCategoriasOrganizar();
  const [editando, setEditando] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const [criando, setCriando] = useState(false);

  const categoria = categoryState.categories.find((c) => c.id === id) ?? null;
  const lancamentos = useMemo(
    () => lancamentosDaCategoria(transactionState.transactions, id),
    [transactionState.transactions, id],
  );
  const { valor } = useMemo(
    () => resumoDaCategoria(transactionState.transactions, id),
    [transactionState.transactions, id],
  );
  const gerenciavel = podeGerenciar(categoria);
  const voltar = () => navigate(SIMPLIFIED_ROUTES.CATEGORIAS);
  const mesRotulo = mes.label.split(' de ')[0].replace(/^./, (letra) => letra.toUpperCase());

  async function handleEditar(values) {
    const resultado = await categoryState.saveCategory(values, editando.id);
    if (!resultado.error) {
      notifyFinancialDataChanged('categorias');
      setEditando(null);
    }
  }

  async function handleExcluir() {
    const resultado = await categoryState.removeCategory(excluindo.id);
    if (!resultado.error) {
      notifyFinancialDataChanged('categorias');
      setExcluindo(null);
      voltar();
    }
  }

  async function handleExcluirMovendo(destinoId) {
    const resultado = await categoryState.removerCategoriaMovendoLancamentos(excluindo.id, destinoId);
    if (!resultado.error) {
      notifyFinancialDataChanged('categorias');
      setExcluindo(null);
      voltar();
    }
  }

  // Sem categoria do mesmo tipo para receber os lançamentos: a folha de
  // exclusão fecha e a de criação abre no tipo desta categoria.
  function handleCriarPelaExclusao() {
    categoryState.clearError?.();
    setExcluindo(null);
    setCriando(true);
  }

  async function handleCriar(values) {
    const resultado = await categoryState.saveCategory(values);
    if (!resultado.error) {
      await categoryState.refresh?.();
      notifyFinancialDataChanged('categorias');
      setCriando(false);
    }
  }

  if (carregando && !categoria) {
    return (
      <div className={styles.page}>
        <SimplifiedSubpageHeader title="Categoria" onBack={voltar} />
        <p className={styles.state} role="status">Carregando categoria...</p>
      </div>
    );
  }

  if (!categoria) {
    return (
      <div className={styles.page}>
        <SimplifiedSubpageHeader title="Categoria" onBack={voltar} />
        <p className={styles.state}>Esta categoria não existe mais. Volte para a lista.</p>
      </div>
    );
  }

  const ehSaida = categoria.category_type === CATEGORY_TYPES.EXPENSE;
  const doEspaco = Boolean(categoria.workspace_id) && categoria.is_system !== true;
  const origem = !doEspaco ? 'Padrão' : gerenciavel ? 'Criada por você' : 'Criada no espaço';

  return (
    <div className={styles.page}>
      <SimplifiedSubpageHeader title={categoria.name} onBack={voltar} />
      <div className={styles.body}>
        <div className={styles.detailHead}>
          <IconBox size={44}><CategoryIcon category={categoria} /></IconBox>
          <span className={styles.detailTitle}>
            <span className={styles.detailName}>{categoria.name}</span>
            <span className={styles.rowHint}>
              {[ehSaida ? 'Saída' : 'Entrada', origem]
                .join(' · ')}
            </span>
          </span>
        </div>

        <div className={styles.months}>
          <div className={styles.monthCard}>
            <span className={styles.summaryLabel}>{mesRotulo}</span>
            <span className={styles.monthValue}>
              {transactionState.isLoading ? '...' : formatCurrency(valor)}
            </span>
            <span className={styles.rowHint}>
              {transactionState.isLoading ? 'Carregando' : plural(lancamentos.length, 'lançamento', 'lançamentos')}
            </span>
          </div>
        </div>

        <h2 className={styles.sectionTitle}>Lançamentos</h2>
        {transactionState.isLoading ? (
          <p className={styles.state} role="status">Carregando lançamentos...</p>
        ) : transactionState.error ? (
          <p className={styles.state} role="alert">Não foi possível carregar os lançamentos.</p>
        ) : lancamentos.length === 0 ? (
          <p className={styles.state}>Nenhum lançamento neste mês.</p>
        ) : (
          <div>
            {lancamentos.map((t) => (
              <div key={t.id} className={styles.row}>
                <span />
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{t.description || categoria.name}</span>
                  <span className={styles.rowHint}>{formatarDia(t.transaction_date)}</span>
                </span>
                <span className={styles.rowValue}>{formatCurrency(Number(t.amount || 0))}</span>
              </div>
            ))}
          </div>
        )}

        <div className={styles.actions}>
          <OutlineButton
            variant="secondary"
            onClick={() => navigate(SIMPLIFIED_ROUTES.RECORDS, { state: { categoryId: categoria.id } })}
          >
            Ver no Financeiro
          </OutlineButton>
          {gerenciavel ? (
            <>
              <OutlineButton
                variant="secondary"
                disabled={categoryState.isMutating}
                onClick={() => {
                  categoryState.clearError?.();
                  setEditando({ ...categoria });
                }}
              >
                Editar categoria
              </OutlineButton>
              <OutlineButton
                variant="ghost"
                disabled={categoryState.isMutating}
                onClick={() => {
                  categoryState.clearError?.();
                  setExcluindo({ ...categoria });
                }}
              >
                Excluir categoria
              </OutlineButton>
            </>
          ) : (
            <p className={styles.note}>
              {doEspaco
                ? 'Só quem criou a categoria ou o administrador do espaço pode editar e excluir.'
                : 'Esta é uma categoria padrão do UniFlow. Para usar outro nome ou ícone, crie uma categoria sua.'}
            </p>
          )}
        </div>
      </div>

      <CategoryCreateModal
        open={Boolean(editando) || criando}
        onClose={() => {
          categoryState.clearError?.();
          setEditando(null);
          setCriando(false);
        }}
        defaultType={categoria.category_type}
        categories={categoryState.categories}
        category={editando}
        onCreate={editando ? handleEditar : handleCriar}
        isMutating={categoryState.isMutating}
        serverError={editando || criando
          ? getCategoryErrorMessage(categoryState.error, 'Não foi possível salvar a categoria. Tente novamente.')
          : ''}
      />

      {excluindo ? (
        <CategoryDeleteConfirmModal
          category={excluindo}
          categories={categoryState.categories}
          isMutating={categoryState.isMutating}
          error={categoryState.error}
          contarLancamentos={categoryState.contarLancamentos}
          onConfirm={handleExcluir}
          onMover={handleExcluirMovendo}
          onCriarCategoria={podeCriar ? handleCriarPelaExclusao : undefined}
          onClose={() => {
            categoryState.clearError?.();
            setExcluindo(null);
          }}
        />
      ) : null}
    </div>
  );
}
