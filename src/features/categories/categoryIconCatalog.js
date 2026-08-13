import { normalizeText } from './categoryUtils.js';

export const CATEGORY_ICON_GROUPS = Object.freeze({
  EXPENSE: 'expense',
  INCOME: 'income',
  GENERIC: 'generic',
});

function iconOption(key, label, group) {
  return Object.freeze({ key, label, group });
}

const EXPENSE_ICONS = Object.freeze([
  iconOption('food', 'Alimentação', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('groceries', 'Mercado', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('restaurant', 'Restaurante', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('home', 'Moradia', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('rent', 'Aluguel', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('condo', 'Condomínio', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('water', 'Água', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('energy', 'Energia', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('gas', 'Gás', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('internet', 'Internet', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('phone', 'Telefone', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('transport', 'Transporte', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('fuel', 'Combustível', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('parking', 'Estacionamento', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('toll', 'Pedágio', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('car-maintenance', 'Manutenção de veículo', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('health', 'Saúde', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('pharmacy', 'Farmácia', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('health-plan', 'Plano de saúde', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('personal-care', 'Beleza e cuidados', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('clothing', 'Vestuário', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('education', 'Educação', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('school-material', 'Material escolar', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('leisure', 'Lazer', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('games', 'Jogos', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('travel', 'Viagens', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('pets', 'Pets', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('subscription', 'Assinaturas', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('taxes', 'Impostos e taxas', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('debt', 'Dívidas', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('loan', 'Empréstimos', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('insurance', 'Seguros', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('gift', 'Presentes', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('shopping', 'Compras', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('electronics', 'Eletrônicos', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('home-maintenance', 'Manutenção da casa', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('services', 'Serviços', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('other-expense', 'Outras saídas', CATEGORY_ICON_GROUPS.EXPENSE),
]);

const INCOME_ICONS = Object.freeze([
  iconOption('salary', 'Salário', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('work', 'Freelance', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('sales', 'Venda', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('commission', 'Comissão', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('bonus', 'Bônus', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('refund', 'Reembolso', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('home-income', 'Aluguel recebido', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('yield', 'Rendimentos', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('investment', 'Investimentos', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('dividends', 'Dividendos', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('retirement', 'Aposentadoria', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('benefits', 'Benefícios', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('pension', 'Pensão', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('gift-income', 'Presente recebido', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('transfer', 'Transferência recebida', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('other-income', 'Outras entradas', CATEGORY_ICON_GROUPS.INCOME),
]);

const GENERIC_ICONS = Object.freeze([
  iconOption('person', 'Pessoa', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('people', 'Pessoas', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('company', 'Empresa', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('store', 'Loja', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('briefcase', 'Maleta', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('star', 'Estrela', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('heart', 'Coração', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('calendar', 'Calendário', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('box', 'Caixa', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('tag', 'Etiqueta', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('wallet', 'Carteira', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('coin', 'Moeda', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('card', 'Cartão', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('document', 'Documento', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('chart', 'Gráfico', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('check', 'Check', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('tool', 'Ferramenta', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('settings', 'Engrenagem', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('package', 'Pacote', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('location', 'Localização', CATEGORY_ICON_GROUPS.GENERIC),
]);

export const CATEGORY_ICON_OPTIONS = Object.freeze([
  ...EXPENSE_ICONS,
  ...INCOME_ICONS,
  ...GENERIC_ICONS,
]);

const ICON_OPTIONS_BY_GROUP = Object.freeze({
  [CATEGORY_ICON_GROUPS.EXPENSE]: EXPENSE_ICONS,
  [CATEGORY_ICON_GROUPS.INCOME]: INCOME_ICONS,
  [CATEGORY_ICON_GROUPS.GENERIC]: GENERIC_ICONS,
});

const LEGACY_ICON_KEYS = Object.freeze(['suppliers', 'operational']);
const KNOWN_ICON_KEYS = new Set([
  ...CATEGORY_ICON_OPTIONS.map(({ key }) => key),
  ...LEGACY_ICON_KEYS,
]);

const KEYWORD_TO_ICON = Object.freeze([
  [['aluguel recebido', 'renda de aluguel', 'locacao recebida'], 'home-income'],
  [['outras despesas', 'outra despesa', 'outras saidas', 'outra saida'], 'other-expense'],
  [['outras entradas', 'outra entrada'], 'other-income'],
  [['plano de saude', 'convenio medico'], 'health-plan'],
  [['material escolar', 'papelaria'], 'school-material'],
  [['manutencao de veiculo', 'oficina', 'mecanico'], 'car-maintenance'],
  [['manutencao da casa', 'reparo da casa'], 'home-maintenance'],
  [['presente recebido', 'doacao recebida'], 'gift-income'],
  [['transferencia recebida'], 'transfer'],
  [['reembolso', 'estorno', 'dinheiro de volta'], 'refund'],
  [['aposentadoria'], 'retirement'],
  [['beneficio', 'vale alimentacao', 'vale refeicao'], 'benefits'],
  [['pensao'], 'pension'],
  [['dividendo'], 'dividends'],
  [['investimento', 'aplicacao'], 'investment'],
  [['rendimento', 'juros'], 'yield'],
  [['comissao'], 'commission'],
  [['bonus', 'premiacao'], 'bonus'],
  [['freelance', 'autonomo', 'servico prestado', 'renda extra'], 'work'],
  [['salario', 'folha', 'holerite'], 'salary'],
  [['venda', 'receita de venda', 'faturamento'], 'sales'],
  [['emprestimo', 'financiamento'], 'loan'],
  [['divida', 'parcela de divida'], 'debt'],
  [['seguro'], 'insurance'],
  [['imposto', 'taxa', 'tributo'], 'taxes'],
  [['assinatura', 'streaming', 'mensalidade', 'recorrente'], 'subscription'],
  [['pet', 'animal', 'veterinario'], 'pets'],
  [['viagem', 'passagem', 'hotel'], 'travel'],
  [['jogo', 'game'], 'games'],
  [['lazer', 'entretenimento', 'passeio', 'diversao'], 'leisure'],
  [['educac', 'escola', 'curso', 'faculdade', 'estudo'], 'education'],
  [['roupa', 'vestuario', 'calcado'], 'clothing'],
  [['beleza', 'cuidados pessoais', 'salao'], 'personal-care'],
  [['farmacia', 'remedio', 'medicamento'], 'pharmacy'],
  [['saude', 'medico'], 'health'],
  [['combustivel', 'gasolina', 'etanol', 'diesel'], 'fuel'],
  [['estacionamento'], 'parking'],
  [['pedagio'], 'toll'],
  [['transporte', 'uber', 'onibus', 'carro', 'mobilidade'], 'transport'],
  [['telefone', 'celular'], 'phone'],
  [['internet', 'wifi'], 'internet'],
  [['energia', 'eletricidade', 'luz'], 'energy'],
  [['agua'], 'water'],
  [['condominio'], 'condo'],
  [['aluguel'], 'rent'],
  [['moradia', 'casa', 'imovel', 'habitacao'], 'home'],
  [['restaurante', 'lanchonete', 'delivery'], 'restaurant'],
  [['mercado', 'supermercado', 'feira'], 'groceries'],
  [['aliment', 'comida'], 'food'],
  [['eletronico', 'tecnologia'], 'electronics'],
  [['compra', 'shopping'], 'shopping'],
  [['presente'], 'gift'],
  [['servico'], 'services'],
]);

const ICON_TONES = Object.freeze({
  food: 'orange', groceries: 'orange', restaurant: 'orange',
  home: 'green', rent: 'green', condo: 'green', 'home-income': 'green',
  water: 'cyan', energy: 'yellow', gas: 'orange', internet: 'cyan', phone: 'blue',
  transport: 'blue', fuel: 'orange', parking: 'blue', toll: 'yellow',
  health: 'red', pharmacy: 'red', 'health-plan': 'red', 'personal-care': 'purple',
  clothing: 'purple', education: 'yellow', leisure: 'purple', games: 'purple',
  travel: 'cyan', pets: 'orange', subscription: 'cyan', taxes: 'yellow',
  debt: 'red', loan: 'red', insurance: 'blue', gift: 'purple', shopping: 'purple',
  electronics: 'blue', salary: 'green', work: 'blue', sales: 'green',
  commission: 'green', bonus: 'yellow', refund: 'cyan', yield: 'green',
  investment: 'green', dividends: 'green', retirement: 'blue', benefits: 'green',
  pension: 'green', 'gift-income': 'purple', transfer: 'blue',
  'other-expense': 'gray', 'other-income': 'green',
});

export function isCategoryIconKey(value) {
  return KNOWN_ICON_KEYS.has(normalizeText(value));
}

export function getDefaultCategoryIconKey(categoryType) {
  if (categoryType === 'income') return 'other-income';
  if (categoryType === 'transfer') return 'transfer';
  return 'other-expense';
}

export function getCategoryIconSections(categoryType) {
  const preferredGroup = categoryType === 'income'
    ? CATEGORY_ICON_GROUPS.INCOME
    : CATEGORY_ICON_GROUPS.EXPENSE;
  const alternativeGroup = preferredGroup === CATEGORY_ICON_GROUPS.INCOME
    ? CATEGORY_ICON_GROUPS.EXPENSE
    : CATEGORY_ICON_GROUPS.INCOME;
  const typeLabel = preferredGroup === CATEGORY_ICON_GROUPS.INCOME ? 'Entrada' : 'Saída';
  const alternativeLabel = preferredGroup === CATEGORY_ICON_GROUPS.INCOME ? 'Saída' : 'Entrada';

  return Object.freeze([
    Object.freeze({
      id: preferredGroup,
      label: `Recomendados para ${typeLabel}`,
      options: ICON_OPTIONS_BY_GROUP[preferredGroup],
    }),
    Object.freeze({
      id: CATEGORY_ICON_GROUPS.GENERIC,
      label: 'Ícones genéricos',
      options: ICON_OPTIONS_BY_GROUP[CATEGORY_ICON_GROUPS.GENERIC],
    }),
    Object.freeze({
      id: alternativeGroup,
      label: `Também disponíveis: ${alternativeLabel}`,
      options: ICON_OPTIONS_BY_GROUP[alternativeGroup],
    }),
  ]);
}

export function resolveCategoryIconKey(category) {
  const explicit = normalizeText(category?.icon);
  if (isCategoryIconKey(explicit)) return explicit;

  const name = normalizeText(category?.name);
  if (name.includes('presente')) {
    return category?.category_type === 'income' ? 'gift-income' : 'gift';
  }
  for (const [keywords, iconKey] of KEYWORD_TO_ICON) {
    if (keywords.some((keyword) => name.includes(keyword))) return iconKey;
  }

  return getDefaultCategoryIconKey(category?.category_type);
}

export function resolveCategoryTone(category) {
  const iconKey = resolveCategoryIconKey(category);
  if (ICON_TONES[iconKey]) return ICON_TONES[iconKey];
  const option = CATEGORY_ICON_OPTIONS.find(({ key }) => key === iconKey);
  if (option?.group === CATEGORY_ICON_GROUPS.INCOME) return 'green';
  if (option?.group === CATEGORY_ICON_GROUPS.EXPENSE) return 'orange';
  return 'blue';
}
