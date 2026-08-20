// UNIUPD2: v1.0.0 é a primeira versão oficial declarada do MVP (mesmo
// valor do seed em public.updates, migration 045). A partir da primeira
// novidade publicada, a versão exibida ao usuário NUNCA mais vem daqui --
// vem de resolveCurrentVersion(updates, APP_VERSION) em uniUpdatesData.js
// (fonte real: a versão da novidade mais recente em public.updates,
// incrementada automaticamente pelo banco -- ver migration 046). Este
// valor só serve de fallback: antes de existir qualquer novidade, ou sem
// Supabase configurado (modo demo). Nunca edite este valor manualmente
// para "lançar uma versão nova" -- isso é feito publicando uma linha em
// public.updates, nunca alterando código.
export const APP_VERSION = '1.0.0';
export const APP_NAME = 'UniFlow AI';
export const APP_TAGLINE = 'Inteligência financeira feita para pessoas reais.';
