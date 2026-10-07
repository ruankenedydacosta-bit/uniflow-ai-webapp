// Épico #91: o app (/app/*) usa Inter nos pesos 400 e 500. A folha só é
// pedida quando o app monta, para a landing e as páginas legais não
// baixarem uma fonte que não usam.
export const APP_FONT_HREF = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap';
const APP_FONT_LINK_ID = 'uf-app-font';

export function ensureAppFont(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById(APP_FONT_LINK_ID)) return;
  const link = doc.createElement('link');
  link.id = APP_FONT_LINK_ID;
  link.rel = 'stylesheet';
  link.href = APP_FONT_HREF;
  doc.head.appendChild(link);
}
