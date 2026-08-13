import { normalizeText } from './categoryUtils.js';

export const CATEGORY_ICON_OPTIONS = Object.freeze([
  Object.freeze({ key: 'food', label: 'Alimentação' }),
  Object.freeze({ key: 'transport', label: 'Transporte' }),
  Object.freeze({ key: 'home', label: 'Moradia' }),
  Object.freeze({ key: 'home-income', label: 'Aluguel recebido' }),
  Object.freeze({ key: 'subscription', label: 'Assinaturas' }),
  Object.freeze({ key: 'health', label: 'Saúde' }),
  Object.freeze({ key: 'leisure', label: 'Lazer' }),
  Object.freeze({ key: 'education', label: 'Educação' }),
  Object.freeze({ key: 'debt', label: 'Dívidas' }),
  Object.freeze({ key: 'work', label: 'Trabalho e freelance' }),
  Object.freeze({ key: 'other-expense', label: 'Outras saídas' }),
  Object.freeze({ key: 'other-income', label: 'Outras entradas' }),
  Object.freeze({ key: 'gift', label: 'Presente' }),
  Object.freeze({ key: 'refund', label: 'Reembolso' }),
  Object.freeze({ key: 'yield', label: 'Rendimentos' }),
  Object.freeze({ key: 'salary', label: 'Salário' }),
  Object.freeze({ key: 'transfer', label: 'Transferência' }),
]);

const TECHNICAL_ICON_KEYS = Object.freeze([
  'taxes',
  'suppliers',
  'operational',
  'sales',
  'wallet',
  'tag',
]);

const KNOWN_ICON_KEYS = new Set([
  ...CATEGORY_ICON_OPTIONS.map(({ key }) => key),
  ...TECHNICAL_ICON_KEYS,
]);

const KEYWORD_TO_ICON = Object.freeze([
  [['aluguel recebido', 'renda de aluguel', 'locacao recebida'], 'home-income'],
  [['outras despesas', 'outra despesa', 'outras saidas', 'outra saida'], 'other-expense'],
  [['outras entradas', 'outra entrada'], 'other-income'],
  [['reembolso', 'estorno', 'dinheiro de volta'], 'refund'],
  [['presente', 'doacao recebida'], 'gift'],
  [['freelance', 'autonomo', 'servico prestado', 'renda extra'], 'work'],
  [['divida', 'emprestimo', 'financiamento', 'parcela de divida'], 'debt'],
  [['moradia', 'aluguel', 'casa', 'imovel', 'condominio', 'habitacao'], 'home'],
  [['aliment', 'mercado', 'comida', 'restaurante', 'supermercado'], 'food'],
  [['transporte', 'combustivel', 'gasolina', 'uber', 'onibus', 'carro', 'mobilidade'], 'transport'],
  [['saude', 'medico', 'farmacia', 'plano de saude'], 'health'],
  [['educac', 'escola', 'curso', 'faculdade', 'estudo'], 'education'],
  [['lazer', 'entretenimento', 'viagem', 'passeio', 'diversao'], 'leisure'],
  [['assinatura', 'streaming', 'mensalidade', 'recorrente'], 'subscription'],
  [['imposto', 'taxa', 'tributo'], 'taxes'],
  [['fornecedor'], 'suppliers'],
  [['operacional', 'operacao'], 'operational'],
  [['salario', 'folha', 'holerite'], 'salary'],
  [['venda', 'receita de venda', 'faturamento'], 'sales'],
  [['rendimento', 'juros', 'investimento', 'dividendo'], 'yield'],
  [['transferencia'], 'transfer'],
]);

const ICON_TONES = Object.freeze({
  food: 'orange',
  transport: 'blue',
  home: 'green',
  'home-income': 'green',
  subscription: 'cyan',
  health: 'red',
  leisure: 'purple',
  education: 'yellow',
  debt: 'red',
  work: 'blue',
  'other-expense': 'gray',
  'other-income': 'green',
  gift: 'purple',
  refund: 'cyan',
  yield: 'green',
  salary: 'green',
  transfer: 'blue',
  taxes: 'yellow',
  suppliers: 'orange',
  operational: 'blue',
  sales: 'green',
  wallet: 'green',
  tag: 'gray',
});

export function isCategoryIconKey(value) {
  return KNOWN_ICON_KEYS.has(normalizeText(value));
}

export function getDefaultCategoryIconKey(categoryType) {
  if (categoryType === 'income') return 'other-income';
  if (categoryType === 'transfer') return 'transfer';
  return 'other-expense';
}

export function resolveCategoryIconKey(category) {
  const explicit = normalizeText(category?.icon);
  if (isCategoryIconKey(explicit)) return explicit;

  const name = normalizeText(category?.name);
  for (const [keywords, iconKey] of KEYWORD_TO_ICON) {
    if (keywords.some((keyword) => name.includes(keyword))) return iconKey;
  }

  return getDefaultCategoryIconKey(category?.category_type);
}

export function resolveCategoryTone(category) {
  return ICON_TONES[resolveCategoryIconKey(category)] ?? 'gray';
}
