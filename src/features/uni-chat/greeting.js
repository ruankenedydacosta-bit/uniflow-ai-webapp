/**
 * Resolve o primeiro nome para a saudação do Chat da Uni a partir do profile
 * real da sessão (useSession → profile.full_name).
 *
 * Regras:
 * - Usa apenas profile.full_name. NUNCA usa e-mail como substituto do nome.
 * - Retorna somente o primeiro nome (evita saudação longa/formal).
 * - Retorna null quando não há nome utilizável (profile ausente/carregando,
 *   full_name vazio, só espaços, ou não-string). O componente decide o
 *   fallback neutro ("Olá!") a partir desse null.
 *
 * @param {{ full_name?: unknown } | null | undefined} profile
 * @returns {string | null}
 */
export function resolveGreetingName(profile) {
  const fullName = profile?.full_name;
  if (typeof fullName !== 'string') return null;

  const trimmed = fullName.trim();
  if (trimmed === '') return null;

  const [firstName] = trimmed.split(/\s+/);
  return firstName || null;
}
