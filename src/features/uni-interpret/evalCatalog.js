// Catálogo de categorias de sistema usado pelo conjunto de avaliação.
// Espelha os seeds de 20260711000300_003_financial_catalog_seeds.sql e
// 20260721001400_014_categories_applies_to.sql: o que um workspace novo
// enxerga antes de criar qualquer categoria própria.

const SISTEMA = [
  ['Salário', 'income', 'personal'],
  ['Rendimentos', 'income', 'personal'],
  ['Freelance', 'income', 'personal'],
  ['Reembolso', 'income', 'personal'],
  ['Presente', 'income', 'personal'],
  ['Aluguel recebido', 'income', 'personal'],
  ['Receita de vendas', 'income', 'business'],
  ['Prestação de serviços', 'income', 'business'],
  ['Comissão', 'income', 'business'],
  ['Recebimentos', 'income', 'business'],
  ['Contratos', 'income', 'business'],
  ['Outras entradas', 'income', 'both'],
  ['Moradia', 'expense', 'personal'],
  ['Alimentação', 'expense', 'personal'],
  ['Transporte', 'expense', 'personal'],
  ['Saúde', 'expense', 'personal'],
  ['Educação', 'expense', 'personal'],
  ['Lazer', 'expense', 'personal'],
  ['Dívidas', 'expense', 'personal'],
  ['Impostos', 'expense', 'business'],
  ['Fornecedores', 'expense', 'business'],
  ['Operacional', 'expense', 'business'],
  ['Folha', 'expense', 'business'],
  ['Marketing', 'expense', 'business'],
  ['Aluguel', 'expense', 'business'],
  ['Equipamentos', 'expense', 'business'],
  ['Assinaturas', 'expense', 'both'],
  ['Outras despesas', 'expense', 'both'],
  ['Transferência', 'transfer', 'both'],
];

function paraCategoria([name, categoryType, appliesTo], index) {
  return {
    id: `cat-${String(index + 1).padStart(2, '0')}`,
    name,
    category_type: categoryType,
    applies_to: appliesTo,
    is_system: true,
    is_active: true,
  };
}

const TODAS = SISTEMA.map(paraCategoria);

// Mesmo filtro de categoryService.js: o workspace vê as categorias do seu
// tipo e as marcadas como "both".
export function catalogoDoWorkspace(workspaceType) {
  return TODAS.filter(
    (category) => category.applies_to === 'both' || category.applies_to === workspaceType,
  );
}

// Metas em aberto do workspace da avaliação (#192): o que o modelo enxerga
// em <metas> para apontar o alvo de editar, excluir e consultar. Nenhuma
// coincide com as metas que os casos pedem para criar.
const METAS = [
  ['meta-01', 'Viagem para o Chile'],
  ['meta-02', 'Casamento'],
  ['meta-03', 'Notebook'],
];

export function metasDaAvaliacao() {
  return METAS.map(([id, name]) => ({ id, name }));
}

// Contas do workspace da avaliação (#161). Só os casos com `contas: true` as
// mandam ao modelo, para não mudar o prompt dos casos que já existiam.
const CONTAS = [
  ['conta-01', 'Nubank'],
  ['conta-02', 'Itaú'],
  ['conta-03', 'Poupança'],
];

export function contasDaAvaliacao() {
  return CONTAS.map(([id, name]) => ({ id, name }));
}

// Catálogo que o caso manda ao modelo: o de sistema do tipo do workspace e
// as categorias criadas pela pessoa (categoriasExtras).
export function catalogoDoCaso(caso) {
  const extras = (caso.categoriasExtras ?? []).map(([name, categoryType], indice) => ({
    id: `extra-${String(indice + 1).padStart(2, '0')}`,
    name,
    category_type: categoryType,
    applies_to: 'both',
    is_system: false,
    is_active: true,
  }));
  return [...catalogoDoWorkspace(caso.workspace ?? 'personal'), ...extras];
}

// Memórias do caso (#79) no formato que o uni-interpret lê do banco.
export function memoriasDoCaso(caso, categorias) {
  return (caso.memorias ?? []).map(({ descricao, categoria }) => ({
    descricao,
    categoria_id: categorias.find((registro) => registro.name === categoria)?.id ?? null,
  }));
}

// Rascunho do caso (#79) no formato que o app manda ao uni-interpret.
export function rascunhoDoCaso(caso, categorias) {
  if (!caso.rascunho) return null;
  const { tipo, valor, data, descricao, categoria } = caso.rascunho;
  const registro = categorias.find((item) => item.name === categoria);
  return {
    operacoes: [{
      tipo,
      valor,
      data: data ?? null,
      descricao,
      categoria: registro ? { id: registro.id, name: registro.name } : null,
      novaCategoria: null,
      conta: null,
      contaDestino: null,
    }],
  };
}
