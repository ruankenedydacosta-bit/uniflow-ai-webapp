/* eslint-disable react-refresh/only-export-components */
import { resolveCategoryIconKey } from './categoryIconCatalog.js';

export { resolveCategoryIconKey } from './categoryIconCatalog.js';

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

// Biblioteca SVG própria da UniFlow. Todos os símbolos seguem a mesma
// grade 24x24, traço 2 e currentColor para continuar compatíveis com o tema.
const ICONS = {
  food: <svg {...svgProps}><path d="M5 3v7a2 2 0 0 0 4 0V3M7 10v11M17 3c-2 1-3 4-3 6s1 3 3 3v9" /></svg>,
  groceries: <svg {...svgProps}><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L21 7H6" /><circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></svg>,
  restaurant: <svg {...svgProps}><circle cx="12" cy="13" r="6" /><path d="M8 3v4M6 3v4a2 2 0 0 0 4 0V3M8 9v2M18 3v8" /></svg>,
  home: <svg {...svgProps}><path d="M3 10.5 12 4l9 6.5M5 9.5V20h14V9.5M9.5 20v-5h5v5" /></svg>,
  rent: <svg {...svgProps}><path d="M3 10.5 12 4l9 6.5M5 9.5V20h14V9.5M9 14h6M12 11v6" /></svg>,
  condo: <svg {...svgProps}><path d="M5 21V4h10v17M15 9h4v12M8 8h1M12 8h1M8 12h1M12 12h1M8 16h1M12 16h1M3 21h18" /></svg>,
  water: <svg {...svgProps}><path d="M12 3s6 6.3 6 11a6 6 0 0 1-12 0c0-4.7 6-11 6-11zM9 15a3 3 0 0 0 3 2" /></svg>,
  energy: <svg {...svgProps}><path d="m13 2-8 12h7l-1 8 8-12h-7l1-8z" /></svg>,
  gas: <svg {...svgProps}><path d="M13 3s4 4 4 8a5 5 0 0 1-10 0c0-2 1-4 3-6 0 3 2 4 3 5 1-2 0-5 0-7zM12 13c2 2 2 5 0 7-2-1-3-4 0-7z" /></svg>,
  internet: <svg {...svgProps}><path d="M4 9a12 12 0 0 1 16 0M7 12a8 8 0 0 1 10 0M10 15a4 4 0 0 1 4 0" /><circle cx="12" cy="19" r="1" /></svg>,
  phone: <svg {...svgProps}><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M10 5h4M11 18h2" /></svg>,
  transport: <svg {...svgProps}><path d="M4 12l1.5-4.5A2 2 0 0 1 7.4 6h9.2a2 2 0 0 1 1.9 1.5L20 12v6h-2v-2H6v2H4z" /><circle cx="7.5" cy="15.5" r="1" /><circle cx="16.5" cy="15.5" r="1" /></svg>,
  fuel: <svg {...svgProps}><path d="M5 21V4h10v17M4 21h12M8 8h4M15 7h2l2 2v8a2 2 0 0 0 2 2V9l-2-2" /></svg>,
  parking: <svg {...svgProps}><circle cx="12" cy="12" r="9" /><path d="M10 17V7h3a3 3 0 0 1 0 6h-3" /></svg>,
  toll: <svg {...svgProps}><path d="M3 8h18M5 8v12M19 8v12M8 8V4h8v4M9 13h6M9 17h6" /></svg>,
  'car-maintenance': <svg {...svgProps}><path d="M4 14l1.5-4A2 2 0 0 1 7.4 8h9.2a2 2 0 0 1 1.9 2l1.5 4v5h-2v-2H6v2H4zM15 6l4-4M17 2l2 2" /><circle cx="8" cy="15" r="1" /><circle cx="16" cy="15" r="1" /></svg>,
  health: <svg {...svgProps}><path d="M12 21s-7-4.5-9-9a5 5 0 0 1 9-2 5 5 0 0 1 9 2c-2 4.5-9 9-9 9zM12 9v6M9 12h6" /></svg>,
  pharmacy: <svg {...svgProps}><path d="m8 17 9-9a4 4 0 0 0-6-6l-9 9a4 4 0 0 0 6 6zM7 6l6 6" /></svg>,
  'health-plan': <svg {...svgProps}><path d="M12 3 4 6v6c0 5 3.4 8 8 10 4.6-2 8-5 8-10V6l-8-3zM12 8v8M8 12h8" /></svg>,
  'personal-care': <svg {...svgProps}><path d="M12 3c-2 3-2 5 0 7 2-2 2-4 0-7zM7 8c1 3 3 4 5 4-1-3-3-4-5-4zM17 8c-1 3-3 4-5 4 1-3 3-4 5-4zM6 21c1-5 3-8 6-9 3 1 5 4 6 9" /></svg>,
  clothing: <svg {...svgProps}><path d="m8 4-5 3 3 5 2-1v9h8v-9l2 1 3-5-5-3c-1 2-7 2-8 0z" /></svg>,
  education: <svg {...svgProps}><path d="M12 4 2 9l10 5 10-5-10-5zM6 11v5c0 1 2.7 2.5 6 2.5S18 17 18 16v-5" /></svg>,
  'school-material': <svg {...svgProps}><path d="M4 5h11a3 3 0 0 1 3 3v12H7a3 3 0 0 0-3 1V5zM7 8h7M7 12h5M18 8h2v12h-2" /></svg>,
  leisure: <svg {...svgProps}><circle cx="12" cy="12" r="8" /><path d="M9 10h.01M15 10h.01M8.5 14c2 2 5 2 7 0" /></svg>,
  games: <svg {...svgProps}><path d="M7 8h10a5 5 0 0 1 4 7l-1 3a2 2 0 0 1-3 1l-3-2h-4l-3 2a2 2 0 0 1-3-1l-1-3a5 5 0 0 1 4-7zM7 12v4M5 14h4M16 13h.01M19 15h.01" /></svg>,
  travel: <svg {...svgProps}><path d="M22 16 13 13V5a2 2 0 0 0-4 0v8l-7 3v2l7-1v3l-2 1v1l4-1 4 1v-1l-2-1v-3l9 1v-2z" /></svg>,
  pets: <svg {...svgProps}><circle cx="7" cy="8" r="2" /><circle cx="17" cy="8" r="2" /><circle cx="4" cy="13" r="2" /><circle cx="20" cy="13" r="2" /><path d="M12 12c-4 0-7 4-5 7 2 2 4 0 5 0s3 2 5 0c2-3-1-7-5-7z" /></svg>,
  subscription: <svg {...svgProps}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4m6-1 1 1-1 1" /></svg>,
  taxes: <svg {...svgProps}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>,
  debt: <svg {...svgProps}><path d="M6 3h9l4 4v14H6zM15 3v5h5M12 11v4M12 18h.01" /></svg>,
  loan: <svg {...svgProps}><path d="M3 9l9-5 9 5M5 10h14M6 10v8M10 10v8M14 10v8M18 10v8M4 20h16M9 14h6" /></svg>,
  insurance: <svg {...svgProps}><path d="M12 3 4 6v6c0 5 3.4 8 8 10 4.6-2 8-5 8-10V6l-8-3zm-3.5 9 2 2 5-5" /></svg>,
  gift: <svg {...svgProps}><rect x="3" y="9" width="18" height="12" rx="1" /><path d="M12 9v12M3 13h18M12 9H7.5a2.5 2.5 0 1 1 2.5-2.5L12 9zm0 0h4.5A2.5 2.5 0 1 0 14 6.5L12 9z" /></svg>,
  shopping: <svg {...svgProps}><path d="M6 8h12l1 13H5L6 8zM9 10V7a3 3 0 0 1 6 0v3" /></svg>,
  electronics: <svg {...svgProps}><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>,
  'home-maintenance': <svg {...svgProps}><path d="M3 11 12 4l9 7M5 10v10h14V10m-10 7 6-6M13 11h2v2M9 15v2h2" /></svg>,
  services: <svg {...svgProps}><path d="M14 6a4 4 0 0 0-5 5l-6 6 4 4 6-6a4 4 0 0 0 5-5l-3 3-3-3 3-3z" /></svg>,
  'other-expense': <svg {...svgProps}><circle cx="12" cy="12" r="9" /><path d="m9 15 6-6M11 9h4v4" /></svg>,
  salary: <svg {...svgProps}><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></svg>,
  work: <svg {...svgProps}><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M9 7V5h6v2M3 12h18M10 12v2h4v-2" /></svg>,
  sales: <svg {...svgProps}><path d="M4 4h7l9 9-7 7-9-9V4z" /><circle cx="8.5" cy="8.5" r="1.5" /></svg>,
  commission: <svg {...svgProps}><circle cx="7" cy="7" r="2" /><circle cx="17" cy="17" r="2" /><path d="M6 18 18 6" /></svg>,
  bonus: <svg {...svgProps}><path d="m12 3 2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8-5.3 2.8 1-6-4.4-4.2 6-.9L12 3z" /><circle cx="12" cy="12" r="2" /></svg>,
  refund: <svg {...svgProps}><path d="M9 7H5V3M5 7a8 8 0 1 1-1 8M12 8v8M9.5 10h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" /></svg>,
  'home-income': <svg {...svgProps}><path d="M3 10.5 12 4l9 6.5M5 9.5V20h14V9.5M12 11v6M9.5 14.5 12 17l2.5-2.5" /></svg>,
  yield: <svg {...svgProps}><path d="m4 17 5-5 3 3 7-8M15 7h5v5" /></svg>,
  investment: <svg {...svgProps}><path d="M4 19V9M10 19V5M16 19v-7M22 19V3M4 13l6-5 6 2 6-6" /></svg>,
  dividends: <svg {...svgProps}><ellipse cx="9" cy="7" rx="5" ry="2.5" /><path d="M4 7v4c0 1.4 2.2 2.5 5 2.5M14 7v3" /><ellipse cx="15" cy="15" rx="5" ry="2.5" /><path d="M10 15v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4" /></svg>,
  retirement: <svg {...svgProps}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18M8 15h8M12 13v4" /></svg>,
  benefits: <svg {...svgProps}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 11h18M8 15h3m6-1 1 1 2-2" /></svg>,
  pension: <svg {...svgProps}><circle cx="12" cy="7" r="3" /><path d="M5 21a7 7 0 0 1 14 0M17 3v4M15 5h4" /></svg>,
  'gift-income': <svg {...svgProps}><rect x="3" y="9" width="18" height="12" rx="1" /><path d="M12 9v12M3 13h18M9 6h6M12 3v6" /></svg>,
  transfer: <svg {...svgProps}><path d="M7 7h11l-3-3M17 17H6l3 3" /></svg>,
  'other-income': <svg {...svgProps}><circle cx="12" cy="12" r="9" /><path d="m15 9-6 6M9 11v4h4" /></svg>,
  person: <svg {...svgProps}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>,
  people: <svg {...svgProps}><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 21a6 6 0 0 1 12 0M14 17a5 5 0 0 1 7 4" /></svg>,
  company: <svg {...svgProps}><path d="M4 21V5h10v16M14 9h6v12M7 9h1M11 9h1M7 13h1M11 13h1M7 17h1M11 17h1M17 13h1M17 17h1M2 21h20" /></svg>,
  store: <svg {...svgProps}><path d="M4 10v10h16V10M3 10l2-6h14l2 6M3 10a3 3 0 0 0 5 2 3 3 0 0 0 4 0 3 3 0 0 0 4 0 3 3 0 0 0 5-2M8 20v-5h8v5" /></svg>,
  briefcase: <svg {...svgProps}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V4h6v3M3 12h18M10 12v2h4v-2" /></svg>,
  star: <svg {...svgProps}><path d="m12 3 2.8 5.6 6.2.9-4.5 4.4 1.1 6.1-5.6-2.9L6.4 20l1.1-6.1L3 9.5l6.2-.9L12 3z" /></svg>,
  heart: <svg {...svgProps}><path d="M12 21S3 16 3 9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 9 2.5C21 16 12 21 12 21z" /></svg>,
  calendar: <svg {...svgProps}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></svg>,
  box: <svg {...svgProps}><path d="m3 7 9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10" /></svg>,
  tag: <svg {...svgProps}><path d="M4 4h7l9 9-7 7-9-9V4z" /><circle cx="8.5" cy="8.5" r="1.5" /></svg>,
  wallet: <svg {...svgProps}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M16 12h3M3 8V6a2 2 0 0 1 2-2h12" /></svg>,
  coin: <svg {...svgProps}><circle cx="12" cy="12" r="9" /><path d="M15 8.5h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9M12 6v2.5M12 16.5V19" /></svg>,
  card: <svg {...svgProps}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></svg>,
  document: <svg {...svgProps}><path d="M6 3h9l4 4v14H6zM15 3v5h5M9 12h6M9 16h6" /></svg>,
  chart: <svg {...svgProps}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  check: <svg {...svgProps}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>,
  tool: <svg {...svgProps}><path d="M14 6a4 4 0 0 0-5 5l-6 6 4 4 6-6a4 4 0 0 0 5-5l-3 3-3-3 3-3z" /></svg>,
  settings: <svg {...svgProps}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></svg>,
  package: <svg {...svgProps}><path d="M4 7 12 3l8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10M8 5l8 4" /></svg>,
  location: <svg {...svgProps}><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z" /><circle cx="12" cy="10" r="2.5" /></svg>,
  suppliers: <svg {...svgProps}><path d="M3 7h13v10H3zM16 10h3l2 3v4h-5" /><circle cx="7" cy="18" r="1.5" /><circle cx="17.5" cy="18" r="1.5" /></svg>,
  operational: <svg {...svgProps}><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></svg>,
};

export function CategoryIcon({ category }) {
  return ICONS[resolveCategoryIconKey(category)] ?? ICONS.tag;
}

export function PlusIcon() {
  return <svg {...svgProps}><path d="M12 5v14M5 12h14" /></svg>;
}

export function SearchIcon() {
  return <svg {...svgProps}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>;
}

export function ClearIcon() {
  return <svg {...svgProps}><path d="M18 6 6 18M6 6l12 12" /></svg>;
}

export function SparkIcon() {
  return <svg {...svgProps}><path d="M12 3l1.8 4.9L18.7 9l-4.9 1.8L12 15.7 10.2 10.8 5.3 9l4.9-1.1L12 3z" /></svg>;
}
