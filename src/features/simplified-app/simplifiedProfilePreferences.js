export const PROFILE_LIMITS = Object.freeze({
  FULL_NAME: 120,
  PREFERRED_NAME: 60,
  CUSTOM_TREATMENT: 40,
  PHONE_DIGITS: 11,
});

export const TREATMENT_OPTIONS = Object.freeze([
  Object.freeze({ value: 'voce', label: 'Você' }),
  Object.freeze({ value: 'senhor', label: 'Senhor' }),
  Object.freeze({ value: 'senhora', label: 'Senhora' }),
  Object.freeze({ value: 'senhorita', label: 'Senhorita' }),
  Object.freeze({ value: 'doutor', label: 'Doutor' }),
  Object.freeze({ value: 'doutora', label: 'Doutora' }),
  Object.freeze({ value: 'prefer_not_to_say', label: 'Prefiro não informar' }),
  Object.freeze({ value: 'other', label: 'Outro' }),
]);

export const LOCALE_OPTIONS = Object.freeze([
  Object.freeze({ value: 'pt-BR', label: 'Português (Brasil)' }),
]);

export const TEXT_SIZE_OPTIONS = Object.freeze([
  Object.freeze({ value: 'small', label: 'Pequeno' }),
  Object.freeze({ value: 'standard', label: 'Padrão' }),
  Object.freeze({ value: 'large', label: 'Grande' }),
]);

const TREATMENT_VALUES = new Set(TREATMENT_OPTIONS.map(({ value }) => value));
const TEXT_SIZE_VALUES = new Set(TEXT_SIZE_OPTIONS.map(({ value }) => value));

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  const withoutCountryCode = digits.startsWith('55') && digits.length > PROFILE_LIMITS.PHONE_DIGITS
    ? digits.slice(2)
    : digits;
  return withoutCountryCode.slice(0, PROFILE_LIMITS.PHONE_DIGITS);
}

export function formatPhone(value) {
  const digits = normalizePhone(value);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function createSimplifiedProfileForm(profile = {}, user = {}) {
  return {
    full_name: profile.full_name ?? user?.user_metadata?.full_name ?? '',
    preferred_name: profile.preferred_name ?? '',
    phone: formatPhone(profile.phone),
    treatment_preference: TREATMENT_VALUES.has(profile.treatment_preference)
      ? profile.treatment_preference
      : 'voce',
    custom_treatment: profile.custom_treatment ?? '',
    birth_date: profile.birth_date ?? '',
    locale: profile.locale === 'pt-BR' ? profile.locale : 'pt-BR',
    text_size: TEXT_SIZE_VALUES.has(profile.text_size) ? profile.text_size : 'standard',
  };
}

export function validateSimplifiedProfileForm(form, { today = new Date() } = {}) {
  const fullName = cleanText(form.full_name);
  const preferredName = cleanText(form.preferred_name);
  const customTreatment = cleanText(form.custom_treatment);
  const phone = normalizePhone(form.phone);

  if (!fullName) return 'Informe seu nome completo.';
  if (fullName.length > PROFILE_LIMITS.FULL_NAME) return 'O nome completo está muito longo.';
  if (preferredName.length > PROFILE_LIMITS.PREFERRED_NAME) return 'O nome preferido está muito longo.';
  if (phone && ![10, 11].includes(phone.length)) return 'Informe um telefone brasileiro válido.';
  if (!TREATMENT_VALUES.has(form.treatment_preference)) return 'Escolha uma forma de tratamento válida.';
  if (form.treatment_preference === 'other' && !customTreatment) return 'Informe como prefere ser tratado.';
  if (customTreatment.length > PROFILE_LIMITS.CUSTOM_TREATMENT) return 'A forma de tratamento está muito longa.';
  if (form.locale !== 'pt-BR') return 'Escolha um idioma disponível.';
  if (!TEXT_SIZE_VALUES.has(form.text_size)) return 'Escolha um tamanho de texto válido.';

  if (form.birth_date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.birth_date)) return 'Informe uma data de nascimento válida.';
    const [year, month, day] = form.birth_date.split('-').map(Number);
    const parsed = new Date(`${form.birth_date}T12:00:00`);
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
    if (
      Number.isNaN(parsed.getTime())
      || parsed.getFullYear() !== year
      || parsed.getMonth() + 1 !== month
      || parsed.getDate() !== day
      || year < 1900
    ) return 'Informe uma data de nascimento válida.';
    if (parsed > todayDate) return 'A data de nascimento não pode estar no futuro.';
  }

  return null;
}

export function buildSimplifiedProfilePayload(form) {
  const treatmentPreference = TREATMENT_VALUES.has(form.treatment_preference)
    ? form.treatment_preference
    : 'voce';

  return {
    full_name: cleanText(form.full_name),
    preferred_name: cleanText(form.preferred_name) || null,
    phone: normalizePhone(form.phone) || null,
    treatment_preference: treatmentPreference,
    custom_treatment: treatmentPreference === 'other'
      ? cleanText(form.custom_treatment)
      : null,
    birth_date: form.birth_date || null,
    locale: 'pt-BR',
    text_size: TEXT_SIZE_VALUES.has(form.text_size) ? form.text_size : 'standard',
  };
}

export function serializeSimplifiedProfileForm(form) {
  return JSON.stringify(buildSimplifiedProfilePayload(form));
}
