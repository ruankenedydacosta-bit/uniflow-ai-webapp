// CAMADA pt-BR COLOQUIAL (Agenda) -- superfície de extensão oficial para a
// futura `src/features/uni-language/pt-br/`. Ver comentários em agendaPtBr.
import {
  buildAgendaReminderPatterns,
  buildAgendaSchedulePatterns,
  hasAgendaVagueSubject,
  stripColloquialLead,
} from './agendaPtBr.js';

export const FINANCIAL_INTENTS = Object.freeze([
  'register_income',
  'register_expense',
  'register_transfer',
  'create_goal',
  'check_balance',
  'set_balance',
  'ambiguous_balance_or_income',
  'forecast',
  'question',
]);

// Intenções de Agenda/Lembrete -- NUNCA entram no fluxo financeiro (nem em
// FINANCIAL_INTENTS nem em ACTION_STATEMENT_INTENTS): com evidência
// semântica de agenda, a frase é resolvida ANTES da interpretação
// financeira, para que números associados a unidades temporais ("daqui 10
// dias", "2 semanas", "mês que vem") jamais sejam interpretados como
// valores monetários.
export const AGENDA_INTENTS = Object.freeze([
  'agenda_reminder_create',
  'agenda_schedule_create',
  'agenda_edit',
  'agenda_complete',
  'agenda_cancel',
  'agenda_query',
  'agenda_no_time',
  'agenda_financial_conflict',
]);

export const AGENDA_INTENT_SET = new Set(AGENDA_INTENTS);

// CAMADA 0 -- heurística de Agenda (não é IA): determina a intenção de
// agenda/lembrete se houver evidência semântica explícita. Roda SEMPRE
// antes das regras financeiras, para evitar falso-positivo financeiro.
//
// Integração pt-BR coloquial (GÍRIAS/REGIONALISMOS/INTERJEIÇÕES e reduções
// de voz): a peça `agendaPtBr.js` abaixo nos fornece a superfície de
// extensão oficial para a futura camada `src/features/uni-language/pt-br/`
// (aliases semânticos, variações regionais, abreviações, erros comuns de
// transcrição por voz e equivalência canônica). Regras desta fase:
// - NUNCA alterar o texto original/transcrição; `stripColloquialLead`
//   opera na cópia normalizada do classificador (representação auxiliar);
// - aceitar interjeições ("bah", "uai", "oxe", "bora"...), "me avisa",
//   "me dá um toque", "não deixa eu esquecer", "anota aí", "bota na
//   agenda", "marca aí", "tenho um negócio", "semana que vem";
// - se o objeto for vago ("aquele negócio"), NÃO inventar: sinalizar
//   `agenda_vague_subject` para o orquestrador perguntar ao usuário.
function detectAgendaIntent(normalizedText) {
  // Interjeições de voz ("bah,", "uai", "oxe", "sexta...") são removidas do
  // INÍCIO da cópia normalizada ANTES de qualquer padrão -- o texto do
  // usuário nunca muda; a normalização é auxiliar e descartada em seguida.
  const text = stripColloquialLead(normalizedText);
  const has = (patterns) => patterns.some((pattern) => pattern.test(text));

  // 1. Lembrete ("me lembra de...", "preciso que você me lembre", "cria um
  //    lembrete...", e pt-BR coloquial "me avisa", "me dá um toque",
  //    "não deixa eu esquecer") -- deve vencer TUDO antes das demais
  //    heurísticas e das regras financeiras.
  if (has([
    /\b(?:me\s+)?lembr(?:a|ar|e|ou|ando)\b/,
    /\blembrete\b/,
    /\bavis(?:ar|e|a|em)\b.*\blembrar\b/,
    ...buildAgendaReminderPatterns(),
  ])) {
    return { intent: 'agenda_reminder_create', confidence: 0.97, signals: ['agenda_reminder_heuristic'] };
  }

  // 1a. Obrigação financeira FUTURA sem comando explícito de lembrete
  // ("Amanhã tenho que pagar 300 reais") é semanticamente ambígua: pode
  // significar "me lembre" ou "quero registrar uma operação". Preservamos
  // os dois sinais e pedimos escolha antes de qualquer escrita. Comandos
  // explícitos de lembrete já retornaram no bloco anterior.
  if (
    /\b(?:hoje|amanha|depois\s+de\s+amanha|domingo|segunda|terca|quarta|quinta|sexta|sabado|semana\s+que\s+vem|mes\s+que\s+vem|daqui\s+a)\b/.test(text)
    && /\b(?:tenho\s+que|preciso|vou)\s+pagar\b/.test(text)
    && /\b(?:r\s*\$\s*)?\d+(?:[.,]\d+)?\s*(?:reais?)?\b/.test(text)
  ) {
    return {
      intent: 'agenda_financial_conflict',
      confidence: 0.72,
      signals: ['agenda_temporal_financial_conflict'],
    };
  }

  // 1b. Objeto vago DEMAIS para assumir ("Bota aquele negócio pra sexta.",
  //     "Marca aí pra amanhã") -- NÃO inventamos o compromisso: devolvemos
  //     criação de agenda com sinal de ambiguidade para o orquestrador
  //     perguntar ("Claro. O que você quer que eu marque para sexta?").
  //     Fica antes de agenda_query porque a frase contém tempo futuro,
  //     mas também antes das regras financeiras para nunca virar
  //     lançamento ("anota aí 50 reais" NÃO passa aqui -- tem valor).
  if (has(buildAgendaSchedulePatterns()) && hasAgendaVagueSubject(text)) {
    return {
      intent: 'agenda_schedule_create',
      confidence: 0.7,
      signals: ['agenda_vague_subject', 'agenda_schedule_heuristic'],
    };
  }

  // 2. Criação de compromisso ("marcar uma reunião", "tenho um
  //    compromisso", "agendar consulta", "reunião daqui a 10 dias",
  //    coloquial "bota na agenda", "tenho um negocio", "sexta tenho
  //    dentista", "daqui uns dez dias") -- vem ANTES de agenda_query, porque
  //    "tenho um compromisso amanhã" também contém "compromisso amanhã"
  //    (padrão de consulta).
  if (has([
    /\b(?:marcar|agendar|agenda|criar)\s+(?:(?:uma|um|a|as|o|os)\s+)?(?:reuniao|compromisso|evento|consulta|agenda)\b/,
    /\b(?:eu\s+)?(?:tenho|tive|vou\s+ter)\s+(?:uma\s+|um\s+)?(?:reuniao|compromisso|consulta|evento)\b/,
    /\b(?:reuniao|compromisso|consulta|evento)\b[^.!?]*\b(?:daqui\s+a|daqui|em)\s*\d+\s*(?:dia|dias|semana|semanas|mes|meses|ano|anos)\b/,
    ...buildAgendaSchedulePatterns(),
  ])) {
    return { intent: 'agenda_schedule_create', confidence: 0.97, signals: ['agenda_schedule_heuristic'] };
  }

  // 2. Consulta de agenda ("qual é minha agenda?", "próximos compromissos")
  if (has([
    /\b(?:qual|quais)\b.*\bagenda\b/,
    /\bminha\s+agenda\b/,
    /\bagenda\s+(?:do|da|de)\s+(?:dia|hoje|amanha|semana|mes|proximo)\b/,
    /\b(?:proximos?|proximas?)\s+(?:compromissos?|eventos?|reunioes?|lembretes?)\b/,
    /\bcompromissos?\s+(?:de\s+)?(?:hoje|amanha|semana)\b/,
    /\bcompromissos?[^.!?]{0,40}\b(?:de\s+)?(?:hoje|amanha|semana)\b/,
    /\b(?:o\s+que|quais?\s+coisas?)\s+(?:eu\s+)?tenho\b[^.!?]*(?:hoje|amanha|semana|sexta|sabado|domingo|fim\s+do\s+mes)/,
  ])) {
    return { intent: 'agenda_query', confidence: 0.97, signals: ['agenda_query_heuristic'] };
  }

  // 4. Edição de compromisso ("remarcar reunião", "adiar compromisso")
if (has([
  /\b(?:remarcar|reagendar|adiar|adia|passa|antecipar|editar|edita(?:r)?|muda(?:r)?)\b.*\b(?:reuniao|compromisso|consulta|evento|horario|titulo|nome)\b/,
  /\bmuda(?:r)?\b[^.!?]+\b(?:para|pras?|as)\s+\d{1,2}(?:[:h]\d{2})?\s*h?\b/,
])) {    return { intent: 'agenda_edit', confidence: 0.97, signals: ['agenda_edit_heuristic'] };
  }

  // 5. Concluir/cancelar/excluir
  if (has([
    /\b(?:concluir|finalizar)\b.*\b(?:reuniao|compromisso|evento|lembrete)\b/,
    /\b(?:ja\s+fiz|pode\s+marcar\s+como\s+concluida?)\b.*\b(?:reuniao|compromisso|evento|lembrete)?\b/,
    /\b(?:cancelar|excluir|desmarcar|remover|cancela)\b.*\b(?:reuniao|compromisso|evento|agenda|consula)\b/,
  ])) {
    const cancelled = /\b(?:cancelar|excluir|desmarcar|remover|cancela)\b/.test(normalizedText);
    return {
      intent: cancelled ? 'agenda_cancel' : 'agenda_complete',
      confidence: 0.97,
      signals: ['agenda_status_heuristic'],
    };
  }

  // 6. "Não tem horário" / "sem horário" (resposta à pergunta de horário)
  if (has([
    /\b(?:nao|sem|sem\s+horario)\s*(?:tem|temos|existe|definid)?\s*horario\b/,
    /\bhorario\b.*\b(?:nao\s+temos?|sem|qualquer)\b/,
  ])) {
    return { intent: 'agenda_no_time', confidence: 0.96, signals: ['agenda_no_time_heuristic'] };
  }

  return null;
}

const INTENT_RULES = [
  {
    intent: 'register_transfer',
    confidence: 0.98,
    patterns: [
      /\btransfer(?:i|ir|encia|indo)\b/,
      /\b(?:fiz|mandei|enviei)\s+(?:um\s+)?pix\b/,
      /\bpix\s+(?:de\s+)?[\d.,]+\s+para\b/,
    ],
  },
  {
    intent: 'create_goal',
    confidence: 0.96,
    patterns: [
      /\bquero\s+(?:juntar|guardar|economizar)\b/,
      /\b(?:criar|definir)\s+(?:uma\s+)?(?:meta|objetivo)\b/,
      /\bmeta\s+de\s+[\d.,]+/,
    ],
  },
  {
    intent: 'forecast',
    confidence: 0.93,
    patterns: [
      /\bquanto\s+(?:eu\s+)?posso\s+(?:gastar|investir|retirar)\b/,
      /\b(?:previsao|projecao|projetad[oa])\b/,
      /\b(?:vai|deve)\s+(?:sobrar|faltar)\b/,
      /\bcomo\s+(?:fica|ficara)\s+(?:meu\s+)?(?:saldo|caixa)\b/,
    ],
  },
  {
    intent: 'set_balance',
    confidence: 0.95,
    patterns: [
      // Declaração de saldo-alvo ("Meu saldo no Nubank é R$ 1.000",
      // "Meu saldo é 1000", "O saldo da conta está 500") -- exige um valor
      // monetário na frase para nunca engolir perguntas ("qual é meu
      // saldo?" não tem valor e continua sendo check_balance).
      /^(?:meu\s+|o\s+|nosso\s+)?saldo\b.*?\b(?:e|eh|esta|estou|ficou|fica|vai\s+ficar)\b.*?(?:r\s*\$|real|reais?|mil|\d)\b/u,
      /^(?:coloca|define|ajusta|ajuste|corrige|corrija)\s+(?:meu\s+|o\s+)?saldo\b.*?(?:r\s*\$|real|reais?|mil|\d)\b/u,
      // "Tenho R$ 1.000 DE SALDO" -- valor + "de saldo" explicito tambem e
      // declaracao de saldo (vem antes do padrao de despesa "reais de" e
      // do padrao ambiguo "tenho <valor>"). O dinheiro pode vir antes OU
      // depois de "saldo" ("tenho 500 reais de saldo" / "tenho de saldo 500").
      /^(?:eu\s+)?tenho\b(?=[\s\S]*?(?:r\s*\$|real|reais?|mil|\d)(\b|\s)).*?\b(?:de|em)\s+saldo\b/u,
    ],
  },
  {
    intent: 'ambiguous_balance_or_income',
    confidence: 0.88,
    patterns: [
      // "Tenho R$ 1.000" / "Tenho 1.000 na poupança" -- declaração com
      // verbo "ter" e valor monetário. Ambígua por natureza: pode ser
      // de produzir uma receita declarada ou saldo declarado. Sempre ancorado no início
      // para nunca capturar perguntas ("quanto tenho...") nem respostas
      // de pendência ("tenho no Nubank").
      /^(?:eu\s+)?tenho\b(?![\s\S]*?\b\d+\s+(?:dia|dias|semana|semanas|mes|meses|ano|anos|horas|minutos)\b)[\s\S]*?(?:r\s*\$|real|reais?|mil|\d)\b/u,
      /^(?:eu\s+)?estou\s+com\b(?![\s\S]*?\b\d+\s+(?:dia|dias|semana|semanas|mes|meses|ano|anos|horas|minutos)\b)[\s\S]*?(?:r\s*\$|real|reais?|mil|\d)\b/u,
      /^(?:eu\s+)?to\s+com\b(?![\s\S]*?\b\d+\s+(?:dia|dias|semana|semanas|mes|meses|ano|anos|horas|minutos)\b)[\s\S]*?(?:r\s*\$|real|reais?|mil|\d)\b/u,
    ],
  },
  {
    intent: 'check_balance',
    confidence: 0.94,
    patterns: [
      /\b(?:qual|quanto)\s+(?:e|eh|tenho|tem)\s+(?:o\s+|de\s+)?(?:meu\s+)?saldo\b/,
      /\bqual\s+(?:o\s+)?meu\s+saldo\b/,
      /\bquanto\s+(?:eu\s+)?tenho\s+(?:na|no|em)\b/,
      /\bconsultar\s+(?:o\s+)?saldo\b/,
      /\bsaldo\s+(?:atual|disponivel)\b/,
    ],
  },
  {
    intent: 'register_income',
    confidence: 0.96,
    patterns: [
      /^(?:eu\s+)?(?:recebi|ganhei|faturei)\b/,
      // BUG REAL: "Entrou mil reais." (valor por extenso) não batia no padrão
      // antigo (que exigia algarismos logo depois do verbo) e caía em
      // 'question' -- e o FinancialQueryEngine ainda a classificava como
      // transaction_reference. O lookahead aceita valor em algarismo OU por
      // extenso (R$/reais/mil/palavras numéricas) em qualquer posição da
      // declaração.
      // BUG REAL: "Entraram mil reais."/"Caiu quinhentos." -- plural do
      // verbo (entraram/cairam) e número por extenso sem "reais"
      // ("quinhentos") não batiam e viravam 'question'. A lista de palavras
      // numéricas ganhou os plurais e o sufixo de gíria ("cinquentão").
      /^(?:entrou|caiu|entraram|cairam)\b(?=.*?\b(?:r\s*\$|\d+(?:[.,]\d+)?|reais?|mil|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos)\b)/u,
      /^(?:entrou|caiu|entraram|cairam)\s+(?:meu|minha|meus|minhas)\b/,
      /\brecebi\s+(?:r\$\s*)?[\d.,]+/,
      // ➝ receita/entrada explícita ("lance uma receita de...", "registra uma)
      /^(?:lance|lanca|registra|registre|anota|anote)\s+(?:uma\s+)?(?:receita|entrada)\b/,
    ],
  },
  {
    intent: 'register_expense',
    confidence: 0.96,
    patterns: [
      // BUG REAL EM PRODUCAO: "Coloquei duzentos reais de gasolina." caia
      // aqui como 'question' (nenhum verbo batia), o parser devolvia
      // handled:false e a frase ia para o chat geral, que respondia "ah,
      // não consigo registrar daqui". "coloquei/botei" são verbos comuns de
      // lancamento coloquial que faltavam nesta lista.
      /^(?:eu\s+)?(?:paguei|gastei|comprei|abasteci|coloquei|botei)\b/,
      /^(?:custou|saiu|foi)\s+(?:r\$\s*)?[\d.,]+/,
      /\b(?:paguei|gastei|coloquei|botei)\s+(?:r\$\s*)?[\d.,]+/,
      // Comandos imperativos genéricos ("lance uma despesa de...", "registra
      // R$ 120 de..."), sem "receita/entrada" explicita -- default despesa.
      /^(?:lance|lanca|registra|registre|anota|anote)\b/,
      // BUG REAL (fluxo de confirmação financeira simples): "Cinquenta reais
      // de gasolina." não tem NENHUM verbo -- nem os anteriores, nem
      // "gastei/paguei/etc" -- e caía em 'question'/unsupported. O parser de
      // uma única operação nunca chegava a criar a ação pendente, e o resultado
      // era gasto desajeitado. O padrão "<valor> reais de <algo>" cobre
      // valores sem verbo, desde que não comece com pergunta ("quanto/quantos/
      // qual/quais/quando/como/onde/por que" -- essas já são interceptadas
      // antes por classifyFinancialQuery, mas esta guarda evita reclassificar
      // uma pergunta como lançamento se ela escapar).
      /^(?!\s*(?:quanto|quantos|quantas|qual|quais|quando|como|onde|por\s*que|porque)\b)(?:[\p{L}\p{N}.,$]+\s+){0,3}reais?\s+de\s+\p{L}/u,
    ],
  },
];

export function normalizeFinancialText(value) {
  if (typeof value !== 'string') return '';

  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyIntent(input) {
  const normalizedText = normalizeFinancialText(input);

  if (!normalizedText) {
    return { intent: 'question', confidence: 0, signals: [] };
  }

  // CAMADA 0 -- agenda/lembrete resolve ANTES de qualquer regra financeira.
  const agendaIntent = detectAgendaIntent(normalizedText);
  if (agendaIntent) return agendaIntent;

  for (const rule of INTENT_RULES) {
    const matchedPattern = rule.patterns.find((pattern) =>
      pattern.test(normalizedText),
    );

    if (matchedPattern) {
      return {
        intent: rule.intent,
        confidence: rule.confidence,
        signals: [matchedPattern.source],
      };
    }
  }

  return {
    intent: 'question',
    confidence: normalizedText.includes('?') ? 0.78 : 0.55,
    signals: [],
  };
}
