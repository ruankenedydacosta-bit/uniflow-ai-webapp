/* eslint-disable react-refresh/only-export-components */
import { normalizeText } from './categoryUtils.js';

// Conjunto de ícones inline (o projeto não usa biblioteca de ícones).
// Todos herdam currentColor e stroke padrão, para respeitar os temas.
const svgProps = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
};

const ICONS = {
  home: (
    <svg {...svgProps}><path d="M3 10.5 12 4l9 6.5" /><path d="M5 9.5V20h14V9.5" /><path d="M9.5 20v-5h5v5" /></svg>
  ),
  food: (
    <svg {...svgProps}><path d="M5 3v7a2 2 0 0 0 4 0V3" /><path d="M7 10v11" /><path d="M17 3c-1.7 0-3 2-3 5s1.3 4 3 4v9" /></svg>
  ),
  transport: (
    <svg {...svgProps}><path d="M4 12l1.5-4.5A2 2 0 0 1 7.4 6h9.2a2 2 0 0 1 1.9 1.5L20 12v6h-2v-2H6v2H4z" /><circle cx="7.5" cy="15.5" r="1" /><circle cx="16.5" cy="15.5" r="1" /></svg>
  ),
  health: (
    <svg {...svgProps}><path d="M12 21s-7-4.5-9-9a5 5 0 0 1 9-2 5 5 0 0 1 9 2c-2 4.5-9 9-9 9z" /></svg>
  ),
  education: (
    <svg {...svgProps}><path d="M12 4 2 9l10 5 10-5-10-5z" /><path d="M6 11v5c0 1 2.7 2.5 6 2.5S18 17 18 16v-5" /></svg>
  ),
  leisure: (
    <svg {...svgProps}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2.5" /></svg>
  ),
  subscription: (
    <svg {...svgProps}><path d="M3 8a9 9 0 0 1 15-3l3 3" /><path d="M21 16a9 9 0 0 1-15 3l-3-3" /><path d="M18 5v3h-3" /><path d="M6 19v-3h3" /></svg>
  ),
  taxes: (
    <svg {...svgProps}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>
  ),
  suppliers: (
    <svg {...svgProps}><path d="M3 7h13v10H3z" /><path d="M16 10h3l2 3v4h-5" /><circle cx="7" cy="18" r="1.5" /><circle cx="17.5" cy="18" r="1.5" /></svg>
  ),
  operational: (
    <svg {...svgProps}><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></svg>
  ),
  salary: (
    <svg {...svgProps}><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></svg>
  ),
  sales: (
    <svg {...svgProps}><path d="M4 19V9l4-4 4 3 4-5 4 4v12z" /></svg>
  ),
  yield: (
    <svg {...svgProps}><path d="M4 17l5-5 3 3 7-8" /><path d="M15 7h5v5" /></svg>
  ),
  wallet: (
    <svg {...svgProps}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M16 12h3" /><path d="M3 8V6a2 2 0 0 1 2-2h12" /></svg>
  ),
  transfer: (
    <svg {...svgProps}><path d="M7 7h11l-3-3" /><path d="M17 17H6l3 3" /></svg>
  ),
  tag: (
    <svg {...svgProps}><path d="M4 4h7l9 9-7 7-9-9V4z" /><circle cx="8.5" cy="8.5" r="1.5" /></svg>
  ),
};

// Palavras-chave -> chave de ícone. Cobre os seeds reais e sinônimos comuns.
const KEYWORD_TO_ICON = [
  [['moradia', 'aluguel', 'casa', 'imovel', 'condominio'], 'home'],
  [['aliment', 'mercado', 'comida', 'restaurante', 'supermercado'], 'food'],
  [['transporte', 'combustivel', 'gasolina', 'uber', 'onibus', 'carro'], 'transport'],
  [['saude', 'medico', 'farmacia', 'plano de saude'], 'health'],
  [['educac', 'escola', 'curso', 'faculdade', 'estudo'], 'education'],
  [['lazer', 'entretenimento', 'viagem', 'passeio'], 'leisure'],
  [['assinatura', 'streaming', 'mensalidade'], 'subscription'],
  [['imposto', 'taxa', 'tributo'], 'taxes'],
  [['fornecedor'], 'suppliers'],
  [['operacional', 'operacao'], 'operational'],
  [['salario', 'folha', 'pagamento', 'holerite'], 'salary'],
  [['venda', 'receita de venda', 'faturamento'], 'sales'],
  [['rendimento', 'juros', 'investimento', 'dividendo'], 'yield'],
  [['transferencia'], 'transfer'],
  [['entrada', 'outras entradas'], 'wallet'],
];

/**
 * Resolve a chave de ícone para uma categoria.
 * Prioriza o campo `icon` do banco (se um dia for populado com uma chave
 * conhecida); senão deriva do nome; senão usa fallback por tipo.
 */
export function resolveCategoryIconKey(category) {
  const explicit = typeof category?.icon === 'string' ? normalizeText(category.icon) : '';
  if (explicit && ICONS[explicit]) return explicit;

  const name = normalizeText(category?.name);
  for (const [keywords, iconKey] of KEYWORD_TO_ICON) {
    if (keywords.some((keyword) => name.includes(keyword))) {
      return iconKey;
    }
  }

  return category?.category_type === 'income' ? 'wallet' : 'tag';
}

/** Retorna o elemento SVG do ícone da categoria (decorativo). */
export function CategoryIcon({ category }) {
  return ICONS[resolveCategoryIconKey(category)] ?? ICONS.tag;
}

export function PlusIcon() {
  return (
    <svg {...svgProps}><path d="M12 5v14M5 12h14" /></svg>
  );
}

export function SearchIcon() {
  return (
    <svg {...svgProps}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
  );
}

export function ClearIcon() {
  return (
    <svg {...svgProps}><path d="M18 6 6 18M6 6l12 12" /></svg>
  );
}

export function SparkIcon() {
  return (
    <svg {...svgProps}><path d="M12 3l1.8 4.9L18.7 9l-4.9 1.8L12 15.7 10.2 10.8 5.3 9l4.9-1.1L12 3z" /></svg>
  );
}
