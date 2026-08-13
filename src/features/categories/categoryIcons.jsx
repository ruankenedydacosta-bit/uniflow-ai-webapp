/* eslint-disable react-refresh/only-export-components */
import { resolveCategoryIconKey } from './categoryIconCatalog.js';

export { resolveCategoryIconKey } from './categoryIconCatalog.js';

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
    <svg {...svgProps}><path d="M12 21s-7-4.5-9-9a5 5 0 0 1 9-2 5 5 0 0 1 9 2c-2 4.5-9 9-9 9z" /><path d="M12 9v6M9 12h6" /></svg>
  ),
  education: (
    <svg {...svgProps}><path d="M12 4 2 9l10 5 10-5-10-5z" /><path d="M6 11v5c0 1 2.7 2.5 6 2.5S18 17 18 16v-5" /></svg>
  ),
  leisure: (
    <svg {...svgProps}><circle cx="12" cy="12" r="8" /><path d="M9 10h.01M15 10h.01M8.5 14c2 2 5 2 7 0" /></svg>
  ),
  subscription: (
    <svg {...svgProps}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /><path d="m17 14 1 1-1 1" /></svg>
  ),
  'home-income': (
    <svg {...svgProps}><path d="M3 10.5 12 4l9 6.5" /><path d="M5 9.5V20h14V9.5" /><path d="M12 11v6M9.5 14.5 12 17l2.5-2.5" /></svg>
  ),
  debt: (
    <svg {...svgProps}><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v5h5M12 11v4M12 18h.01" /></svg>
  ),
  work: (
    <svg {...svgProps}><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M9 7V5h6v2M3 12h18M10 12v2h4v-2" /></svg>
  ),
  'other-expense': (
    <svg {...svgProps}><circle cx="12" cy="12" r="9" /><path d="m9 15 6-6M11 9h4v4" /></svg>
  ),
  'other-income': (
    <svg {...svgProps}><circle cx="12" cy="12" r="9" /><path d="m15 9-6 6M9 11v4h4" /></svg>
  ),
  gift: (
    <svg {...svgProps}><rect x="3" y="9" width="18" height="12" rx="1" /><path d="M12 9v12M3 13h18M12 9H7.5a2.5 2.5 0 1 1 2.5-2.5L12 9Zm0 0h4.5A2.5 2.5 0 1 0 14 6.5L12 9Z" /></svg>
  ),
  refund: (
    <svg {...svgProps}><path d="M9 7H5v-4" /><path d="M5 7a8 8 0 1 1-1 8" /><path d="M12 8v8M9.5 10h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" /></svg>
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
