import { normalizeFinancialText } from './intentClassifier.js';

const CATEGORY_RULES = [
  { category: 'Salário', terms: ['salario', 'pagamento', 'holerite'] },
  { category: 'Receita de vendas', terms: ['venda', 'cliente', 'faturamento'] },
  { category: 'Alimentação', terms: ['alimentacao', 'mercado', 'supermercado', 'comida', 'restaurante', 'ifood'] },
  { category: 'Transporte', terms: ['gasolina', 'combustivel', 'uber', '99', 'onibus', 'transporte'] },
  { category: 'Moradia', terms: ['casa', 'aluguel', 'condominio', 'energia', 'luz', 'agua'] },
  { category: 'Saúde', terms: ['saude', 'farmacia', 'medico', 'consulta'] },
  { category: 'Educação', terms: ['educacao', 'curso', 'faculdade', 'escola'] },
  { category: 'Assinaturas', terms: ['assinatura', 'netflix', 'spotify', 'streaming'] },
  { category: 'Impostos', terms: ['imposto', 'tributo', 'das', 'ipva', 'iptu'] },
  { category: 'Fornecedores', terms: ['fornecedor', 'fornecedores'] },
  { category: 'Lazer', terms: ['cinema', 'viagem', 'lazer', 'show'] },
];

export function resolveCategory(input, intent = 'question') {
  if (intent === 'register_transfer') {
    return { category: 'Transferência', matchedTerm: 'transferencia', confidence: 1 };
  }

  const normalizedText = normalizeFinancialText(input);

  for (const rule of CATEGORY_RULES) {
    const matchedTerm = rule.terms.find((term) =>
      new RegExp(`\\b${term}\\b`).test(normalizedText),
    );

    if (matchedTerm) {
      return { category: rule.category, matchedTerm, confidence: 0.92 };
    }
  }

  return { category: null, matchedTerm: null, confidence: 0 };
}
