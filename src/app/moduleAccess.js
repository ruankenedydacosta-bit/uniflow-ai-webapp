import { WORKSPACE_TYPES } from './access.js';

/**
 * FONTE DECLARATIVA ÚNICA de acesso por contexto PF/PJ.
 *
 * Mapeia IDs canônicos de módulo (não texto de menu) → contextos de workspace
 * onde o módulo é permitido. É consumida tanto pela navegação desktop
 * (`navigation.js` → Sidebar) quanto pela shell mobile (`shellRoutes.js` →
 * BottomNavigation / MoreMenu), eliminando a divergência histórica em que cada
 * camada decidia visibilidade por conta própria.
 *
 * Contextos possíveis: 'personal' (PF), 'business' (PJ).
 * IDs derivados das rotas/módulos reais do projeto (ver routes.jsx / navigation.js).
 */
const PERSONAL = WORKSPACE_TYPES.PERSONAL;
const BUSINESS = WORKSPACE_TYPES.BUSINESS;
const BOTH = Object.freeze([PERSONAL, BUSINESS]);
const BUSINESS_ONLY = Object.freeze([BUSINESS]);
const PERSONAL_ONLY = Object.freeze([PERSONAL]);

export const MODULE_IDS = Object.freeze({
  DASHBOARD: 'dashboard',
  UNI_AI: 'uni-ai',
  FINANCEIRO: 'financeiro',
  OBJETIVOS: 'objetivos',
  FUTURO: 'futuro',
  CRM: 'crm',
  CLIENTES: 'clientes',
  PROJETOS: 'projetos',
  AGENDA: 'agenda',
  RELATORIOS: 'relatorios',
  CONFIGURACOES: 'configuracoes',
  CATEGORIAS: 'categorias',
  OPEN_FINANCE: 'open-finance',
  SUPORTE: 'suporte',
});

/**
 * Módulo → contextos permitidos. Hoje nenhum módulo é exclusivo PF; o mecanismo,
 * porém, suporta PF-only (PERSONAL_ONLY) sem qualquer alteração de código.
 */
export const MODULE_ACCESS = Object.freeze({
  [MODULE_IDS.DASHBOARD]: BOTH,
  [MODULE_IDS.UNI_AI]: BOTH,
  [MODULE_IDS.FINANCEIRO]: BOTH,
  [MODULE_IDS.OBJETIVOS]: BOTH,
  [MODULE_IDS.FUTURO]: BOTH,
  [MODULE_IDS.CRM]: BUSINESS_ONLY,
  [MODULE_IDS.CLIENTES]: BUSINESS_ONLY,
  [MODULE_IDS.PROJETOS]: BUSINESS_ONLY,
  [MODULE_IDS.AGENDA]: BOTH,
  [MODULE_IDS.RELATORIOS]: BOTH,
  [MODULE_IDS.CONFIGURACOES]: BOTH,
  [MODULE_IDS.CATEGORIAS]: BOTH,
  [MODULE_IDS.OPEN_FINANCE]: BOTH,
  [MODULE_IDS.SUPORTE]: BOTH,
});

// Reservado para uso futuro / clareza de intenção (mecanismo suporta PF-only).
export { PERSONAL_ONLY };

const VALID_CONTEXTS = new Set([PERSONAL, BUSINESS]);

/** Contextos onde o módulo é permitido; módulo desconhecido é tratado como BOTH (fail-open seguro para rotas legadas ainda não mapeadas). */
export function getModuleContexts(moduleId) {
  return MODULE_ACCESS[moduleId] ?? BOTH;
}

/**
 * Guard reutilizável: o módulo é acessível no contexto ativo?
 * Contexto inválido/ausente → false (fail-closed), evitando tela em branco por
 * decisão ambígua. Não redireciona nem cria loop; apenas responde à pergunta.
 */
export function canAccessModule(moduleId, context) {
  if (!VALID_CONTEXTS.has(context)) return false;
  return getModuleContexts(moduleId).includes(context);
}

/** Lista de IDs de módulo permitidos no contexto atual. */
export function modulesForContext(context) {
  if (!VALID_CONTEXTS.has(context)) return [];
  return Object.keys(MODULE_ACCESS).filter((moduleId) => canAccessModule(moduleId, context));
}
