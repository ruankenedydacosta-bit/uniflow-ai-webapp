/**
 * Constantes internas do Sidebar. Não exportado em index.js — é detalhe
 * de implementação, não parte da API pública do componente.
 */

/** data-attribute usado para o CSS reconhecer o estado colapsado sem
 * precisar de uma segunda classe condicional (ver Sidebar.module.css). */
export const COLLAPSED_ATTR = 'data-collapsed';

/**
 * Largura expandida, em px. Não é um token de espaçamento (--uf-space-*)
 * porque não representa "espaço entre elementos" — é a largura
 * estrutural do próprio componente, decisão de layout local. A própria
 * utilities.css (§6) documenta esse caso como legítimo: "larguras fixas
 * específicas de um componente (ex.: 320px de uma sidebar) — isso é
 * decisão de layout do componente, não utilitário."
 *
 * A largura colapsada NÃO tem uma constante irmã aqui de propósito: ela
 * é composta inteiramente a partir de tokens já existentes via calc()
 * dentro de Sidebar.module.css (--uf-icon-size-lg + padding), então não
 * introduz nenhum valor novo, nem aqui nem lá.
 */
export const SIDEBAR_WIDTH_EXPANDED = 280;
