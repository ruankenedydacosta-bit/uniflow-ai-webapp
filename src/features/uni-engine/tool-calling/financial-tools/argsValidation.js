// Uni Engine — Fase 20.2: Tool Calling — validação estrita de argumentos.
//
// Valida os argumentos recebidos pelas ferramentas financeiras de leitura.
//
// Regras:
//   - aceita apenas objetos plain JSON serializáveis (nada de funções, Date,
//     Map, Set, símbolos ou objetos com protótipo customizado);
//   - chaves desconhecidas críticas são rejeitadas;
//   - strings com limite de tamanho (nada de strings arbitrariamente longas);
//   - período (YYYY-MM), mês e ano validados por regex + faixa;
//   - NUNCA lança para o chat — toda falha retorna erro padronizado.
import { isSerializableValue } from '../contracts/index.js';

export const MAX_STRING_LENGTH = 128;
export const MAX_OBJECT_KEYS = 16;

const YEAR_RE = /^\d{4}$/;
const MONTH_ONLY_RE = /^(0[1-9]|1[0-2])$/;
const KNOWN_VALUE_STATUSES = new Set([
  'active',
  'on_track',
  'late',
  'complete',
  'paused',
  'archived',
]);

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isSafeString(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_STRING_LENGTH;
}

function isSafeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isMonthKeyInRange(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) return false;
  const year = Number.parseInt(value.slice(0, 4), 10);
  const month = Number.parseInt(value.slice(5, 7), 10);
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12;
}

// Valida `args` contra um schema de tipos. `schema` mapeia chave → tipo:
//   'string' | 'number' | 'period' (YYYY-MM, faixa 2000-2100) | 'year'
//   | 'month' | 'status' (enum conhecido de metas) | 'category'
// `required` é lista de chaves obrigatórias (ausentes → REQUIRED_<chave>).
// Retorna { ok, args, errors } — nunca lança.
export function validateToolArguments(args, schema, required = []) {
  const input = args && typeof args === 'object' && isPlainObject(args) ? args : null;
  const errors = [];

  if (!input) {
    return { ok: false, args: {}, errors: ['ARGS_INVALID'] };
  }
  if (!isSerializableValue(input)) {
    return { ok: false, args: {}, errors: ['ARGS_NOT_SERIALIZABLE'] };
  }
  const keys = Object.keys(input);
  if (keys.length > MAX_OBJECT_KEYS) {
    return { ok: false, args: {}, errors: ['ARGS_TOO_MANY_KEYS'] };
  }

  const clean = {};
  const requiredList = Array.isArray(required) ? required : [];
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(schema, key)) {
      errors.push(`UNKNOWN_KEY_${key}`);
      continue;
    }
    const type = schema[key];
    const value = input[key];
    if (type === 'string' || type === 'category') {
      if (!isSafeString(value)) {
        errors.push(`INVALID_${key}`);
        continue;
      }
      clean[key] = value;
    } else if (type === 'number') {
      if (!isSafeNumber(value)) {
        errors.push(`INVALID_${key}`);
        continue;
      }
      clean[key] = value;
    } else if (type === 'period') {
      if (!isMonthKeyInRange(value)) {
        errors.push(`INVALID_${key}`);
        continue;
      }
      clean[key] = value;
    } else if (type === 'year') {
      if (typeof value !== 'string' || !YEAR_RE.test(value)) {
        errors.push(`INVALID_${key}`);
        continue;
      }
      const year = Number.parseInt(value, 10);
      if (year < 2000 || year > 2100) {
        errors.push(`INVALID_${key}`);
        continue;
      }
      clean[key] = value;
    } else if (type === 'month') {
      if (typeof value !== 'string' || !MONTH_ONLY_RE.test(value)) {
        errors.push(`INVALID_${key}`);
        continue;
      }
      clean[key] = value;
    } else if (type === 'status') {
      if (typeof value !== 'string' || !KNOWN_VALUE_STATUSES.has(value)) {
        errors.push(`INVALID_${key}`);
        continue;
      }
      clean[key] = value;
    } else {
      errors.push(`UNKNOWN_TYPE_${key}`);
    }
  }

  for (const requiredKey of requiredList) {
    if (!Object.prototype.hasOwnProperty.call(clean, requiredKey)) {
      errors.push(`REQUIRED_${requiredKey}`);
    }
  }

  return errors.length > 0 ? { ok: false, args: clean, errors } : { ok: true, args: clean, errors: [] };
}