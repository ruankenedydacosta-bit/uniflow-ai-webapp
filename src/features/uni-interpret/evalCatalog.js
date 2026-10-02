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
