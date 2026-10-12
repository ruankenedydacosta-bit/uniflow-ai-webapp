import { useMemo, useState } from 'react';
import IconBox from '../../components/ui/IconBox';
import ProgressBar from '../../components/ui/ProgressBar';
import Segmented from '../../components/ui/Segmented';
import { notifyFinancialDataChanged } from '../../services/financialDataEvents.js';
import { formatCurrency } from '../../utils/formatters.js';
import { PhCaretDownIcon, PhPlusIcon, PhTagIcon } from '../simplified-app/SimplifiedIcons.jsx';
import SimplifiedSubpageHeader from '../simplified-app/SimplifiedSubpageHeader.jsx';
import { useNavegar } from '../simplified-app/movimentoDeTelaContext.js';
import { SIMPLIFIED_ROUTES, categoriaPath } from '../simplified-app/simplifiedRoutes.js';
import { montarListaDeCategorias } from './categoriasDoMes.js';
import { CATEGORY_TYPES, getCategoryErrorMessage } from './categoryUtils.js';
import { CategoryIcon } from './categoryIcons.jsx';
import CategoryCreateModal from './components/CategoryCreateModal.jsx';
import { useCategoriasOrganizar } from './useCategoriasOrganizar.js';
import styles from './organizar.module.css';

const TIPOS = [
  { value: CATEGORY_TYPES.EXPENSE, label: 'Saídas' },
  { value: CATEGORY_TYPES.INCOME, label: 'Entradas' },
];

function plural(quantidade, singular, pluralForma) {
  return `${quantidade} ${quantidade === 1 ? singular : pluralForma}`;
}

// Lista de categorias (handoff 10b): uma linha por categoria, ordenada pelo
// valor do mês, com a barra do peso. Tocar abre o detalhe.
export default function CategoriasListaPage() {
  const navigate = useNavegar();
  const { mes, categoryState, transactionState, podeCriar, carregando } = useCategoriasOrganizar();
  const [tipo, setTipo] = useState(CATEGORY_TYPES.EXPENSE);
  const [semAberto, setSemAberto] = useState(false);
  const [criando, setCriando] = useState(false);

  const lista = useMemo(() => montarListaDeCategorias({
    categories: categoryState.categories,
    transactions: transactionState.transactions,
    type: tipo,
  }), [categoryState.categories, transactionState.transactions, tipo]);

  const mesCurto = mes.label.split(' de ')[0];
  const mesRotulo = mesCurto.charAt(0).toUpperCase() + mesCurto.slice(1);
  const vazio = !carregando
    && lista.comLancamento.length === 0
    && lista.semLancamento.length === 0
    && lista.semCategoria.quantidade === 0;
  const ehSaida = tipo === CATEGORY_TYPES.EXPENSE;

  async function handleCriar(values) {
    const resultado = await categoryState.saveCategory(values);
    if (!resultado.error) {
      notifyFinancialDataChanged('categorias');
      setCriando(false);
      if (values.category_type !== tipo) setTipo(values.category_type);
    }
  }

  function renderLinha(linha, { comBarra }) {
    return (
      <button
        key={linha.id}
        type="button"
        className={styles.row}
        onClick={() => navigate(categoriaPath(linha.id))}
      >
        <IconBox><CategoryIcon category={linha} /></IconBox>
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>{linha.name}</span>
          {comBarra ? (
            <span className={styles.rowHint}>
              {[plural(linha.quantidade, 'lançamento', 'lançamentos'), linha.criadaPeloUsuario ? 'criada por você' : null]
                .filter(Boolean).join(' · ')}
            </span>
          ) : linha.criadaPeloUsuario ? <span className={styles.rowHint}>criada por você</span> : null}
        </span>
        {comBarra ? <span className={styles.rowValue}>{formatCurrency(linha.valor)}</span> : <span />}
        {comBarra ? <ProgressBar value={linha.peso * 100} /> : null}
      </button>
    );
  }

  return (
    <div className={styles.page}>
      <SimplifiedSubpageHeader title="Categorias" onBack={() => navigate(SIMPLIFIED_ROUTES.ORGANIZAR)} />
      <div className={styles.body}>
        <Segmented label="Tipo de categoria" options={TIPOS} value={tipo} onChange={setTipo} />

        {carregando ? (
          <p className={styles.state} role="status">Carregando categorias...</p>
        ) : vazio ? (
          <p className={styles.state}>Nenhuma categoria aqui ainda. Toque em + para criar a primeira.</p>
        ) : (
          <>
            <div className={styles.summary}>
              <span className={styles.summaryLabel}>{mesRotulo}</span>
              <span className={styles.summaryValue}>{formatCurrency(lista.total)}</span>
              <span className={styles.summaryLabel}>
                {lista.comLancamento.length > 0
                  ? `${ehSaida ? 'Saiu' : 'Entrou'} em ${plural(lista.comLancamento.length, 'categoria', 'categorias')}`
                  : `Nada ${ehSaida ? 'saiu' : 'entrou'} neste mês`}
              </span>
            </div>
            <div>
              {lista.comLancamento.map((linha) => renderLinha(linha, { comBarra: true }))}
              {lista.semCategoria.quantidade > 0 ? (
                <div className={styles.row}>
                  <IconBox><PhTagIcon /></IconBox>
                  <span className={styles.rowText}>
                    <span className={styles.rowTitle}>Sem categoria</span>
                    <span className={styles.rowHint}>{plural(lista.semCategoria.quantidade, 'lançamento', 'lançamentos')}</span>
                  </span>
                  <span className={styles.rowValue}>{formatCurrency(lista.semCategoria.valor)}</span>
                </div>
              ) : null}
            </div>
            {lista.semLancamento.length > 0 ? (
              <div>
                <button
                  type="button"
                  className={styles.moreButton}
                  aria-expanded={semAberto}
                  onClick={() => setSemAberto((aberto) => !aberto)}
                >
                  <span>Sem lançamento em {mesRotulo.toLowerCase()}</span>
                  <span>{lista.semLancamento.length} <PhCaretDownIcon /></span>
                </button>
                {semAberto ? lista.semLancamento.map((linha) => renderLinha(linha, { comBarra: false })) : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      <button
        type="button"
        className={styles.fab}
        aria-label="Nova categoria"
        onClick={() => setCriando(true)}
        disabled={!podeCriar}
      >
        <PhPlusIcon />
      </button>

      <CategoryCreateModal
        open={criando}
        onClose={() => {
          categoryState.clearError?.();
          setCriando(false);
        }}
        defaultType={tipo}
        categories={categoryState.categories}
        onCreate={handleCriar}
        isMutating={categoryState.isMutating}
        serverError={criando
          ? getCategoryErrorMessage(categoryState.error, 'Não foi possível salvar a categoria. Tente novamente.')
          : ''}
      />
    </div>
  );
}
