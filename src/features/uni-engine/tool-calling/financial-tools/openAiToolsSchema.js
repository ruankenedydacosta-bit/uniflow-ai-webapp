// Uni Engine — Sprint 1 (IA Conversacional): conversor de FINANCIAL_READ_TOOL_META
// para o formato de `tools` exigido pela OpenAI Chat Completions API.
//
// Única fonte de verdade continua sendo FINANCIAL_READ_TOOL_META
// (financial-tools/registry.js, Fase 20.2) — este módulo apenas traduz o
// formato de schema já existente ({type, required} por campo) para o JSON
// Schema que a OpenAI exige em `function.parameters`. Nenhuma ferramenta
// nova, nenhuma lógica de execução duplicada — a execução real continua
// exclusivamente pelo dispatcher (Fase 20+), nunca por este módulo.
import { FINANCIAL_READ_TOOL_NAMES, FINANCIAL_READ_TOOL_META } from './registry.js';

// Descrições curtas por "tipo" de campo do schema interno — usadas só para
// enriquecer a descrição JSON Schema exposta à OpenAI (todo campo vira
// `string` no JSON Schema; o tipo interno é só uma dica semântica).
const FIELD_TYPE_HINTS = Object.freeze({
  period: 'Período no formato YYYY-MM (ex.: "2026-08"). Omitir para o período atual.',
  category: 'Nome de uma categoria já existente.',
  status: 'Filtro de status (ex.: "active", "complete").',
  string: undefined,
});

function buildParameterSchema(fieldSchema) {
  const properties = {};
  const required = [];
  for (const [fieldName, definition] of Object.entries(fieldSchema ?? {})) {
    const hint = FIELD_TYPE_HINTS[definition?.type];
    properties[fieldName] = hint ? { type: 'string', description: hint } : { type: 'string' };
    if (definition?.required === true) required.push(fieldName);
  }
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

// Gera o array `tools` no formato OpenAI a partir dos 6 tools de leitura já
// aprovados (Fase 20.2). Determinístico e puro — sem I/O, sem estado.
export function buildOpenAiToolsSchema() {
  return FINANCIAL_READ_TOOL_NAMES.map((name) => {
    const meta = FINANCIAL_READ_TOOL_META[name];
    return {
      type: 'function',
      function: {
        name,
        description: meta.description,
        parameters: buildParameterSchema(meta.schema),
      },
    };
  });
}
