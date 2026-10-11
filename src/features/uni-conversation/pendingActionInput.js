import { extractAmount, normalizeFinancialText, parseFinancialText } from '../uni-intents/index.js';
import { normalizeFinancialInstitutionName } from '../financial-institutions/index.js';

// BLOCO F: fala real do usuário raramente é um token isolado ("confirma")
// -- variações comuns como "sim, pode confirmar" ou "confirma isso aí"
// não batiam antes, caindo num fallback genérico (ou, no pior caso, no
// chat de texto livre, que corretamente se descreve como incapaz de
// executar ações -- nunca deveria ser alcançado com uma confirmação real
// pendente). Continua exigindo a frase INTEIRA bater com um destes
// padrões -- nunca um "includes" cego que arriscaria confirmar/cancelar a
// partir de texto ambíguo.
const CONFIRMATION_PATTERNS = [
  // BUG REAL EM PRODUCAO: "Sí." (dito por voz, transcrito com acento --
  // normalizeFinancialText derruba o acento e vira "si", mas "si" nunca
  // esteve na lista de sinônimos de "sim") não confirmava nada; a Uni
  // respondia pedindo para "dizer confirmar" mesmo depois do usuário já
  // ter confirmado.
  /^(?:sim|si|confirmar|confirmo|confirma|confirmado|certo|ok|isso|pode|pode usar|cria)[.!]?$/,
  /^(?:pode registrar|pode salvar|pode confirmar|pode continuar|pode lancar|pode seguir)[.!]?$/,
  /^confirma(?:r)?\s+a[ií][.!]?$/,
  /^sim,?\s*(?:pode\s+)?confirma(?:r)?[.!]?$/,
  /^confirma(?:r)?\s+isso(?:\s+a[íi])?[.!]?$/,
  /^t[áa]\s+certo,?\s*(?:pode\s+)?confirma(?:r)?[.!]?$/,
  // BUG REAL (BUG 2): "Pode sim, pode confirmar e registrar." era a resposta
  // natural do usuário à pergunta "Posso confirmar e registrar tudo isso?"
  // e não batia em nenhum padrão -- a confirmação caía no fallback
  // ("Não consigo criar, alterar ou excluir..."). Padrões sempre âncora
  // completa de frase, como os demais.
  /^pode\s+sim[.!]?$/,
  /^pode\s+sim,?\s*(?:pode\s+)?(?:confirmar|registrar)(?:\s+e\s+(?:confirmar|registrar))?[.!]?$/,
  /^(?:pode\s+)?(?:confirmar|registrar)\s+e\s+(?:confirmar|registrar)(?:\s+tudo\s+isso)?[.!]?$/,
  /^(?:sim,?\s*)?pode\s+registrar\s+(?:tudo|tudo\s+isso)[.!]?$/,
  /^sim,?\s*(?:pode\s+)?registrar[.!]?$/,
];
const CANCELLATION_PATTERNS = [
  /^(?:nao|cancelar|cancela|deixa|deixa pra la|esquece)[.!]?$/,
  /^(?:sim,?\s*)?cancela(?:r)?\s+tudo[.!]?$/,
  /^n[ãa]o,?\s*cancela(?:r)?[.!]?$/,
];

// HOTFIX FINAL P2: marcadores fortes de abandono que aparecem dentro de uma
// frase mais longa (nunca a frase inteira sozinha) -- "esquece isso, falei
// errado.", "cancela isso.", "não quero mais registrar isso." não batiam em
// CANCELLATION_PATTERNS (âncora de frase INTEIRA) e caíam como resposta ao
// campo pendente, arriscando propor uma conta/categoria com o texto
// inteiro. Diferente da lista acima, aqui o match é por CONTAINS -- mas a
// lista continua pequena e fechada a marcadores inequívocos de desistência
// (nunca uma palavra isolada que poderia ser parte legítima de uma
// conta/categoria/descrição real).
const CANCELLATION_CONTAINS_PATTERNS = [
  /falei errado/,
  /quis dizer errado/,
  /nao quero mais registrar/,
  /nao quero mais fazer isso/,
  /nao precisa mais registrar/,
  /esquece isso/,
  /deixa pra la isso/,
  /cancela isso/,
  /desconsidera isso/,
  /ignora isso/,
];

const ACCOUNT_IDENTITY_FIELDS = Object.freeze([
  'name',
  'institution_name',
  'institution',
  'nickname',
  'alias',
  'metadata.nickname',
  'metadata.alias',
]);

function readIdentityField(item, field) {
  return field.split('.').reduce((current, key) => current?.[key], item);
}

function belongsToWorkspace(item, workspaceId) {
  return !workspaceId || !item?.workspace_id || item.workspace_id === workspaceId;
}

function findMatches(items, input, fields = ['name'], workspaceId = null) {
  const normalizedInput = normalizeFinancialText(input);
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.is_active !== false)
    .filter((item) => belongsToWorkspace(item, workspaceId))
    .filter((item) => {
      const identities = fields
        .map((field) => normalizeFinancialText(readIdentityField(item, field)))
        .filter(Boolean);
      return identities.some((identity) => (
        identity === normalizedInput
        || normalizedInput.includes(identity)
        || identity.includes(normalizedInput)
      ));
    });
}

// BUG REAL EM PRODUÇÃO (voz): "Tá, confirmado, pode confirmar." não
// confirmava -- falando, a resposta vem com aberturas afirmativas antes do
// pedido ("tá", "ok", "isso", "sim"). Elas saem do começo e o resto passa
// pelas mesmas listas de frase inteira; "Sim, cancela" continua cancelando.
const AFFIRMATIVE_OPENING = /^(?:(?:ta\s+bom|ta\s+certo|ta|ok|okay|isso|sim|beleza|certo|perfeito|claro|confirmado|pode\s+sim)[,.!]?\s+)+/;

// BUG REAL EM PRODUÇÃO (voz): a conversa por voz repassa a frase como foi
// dita. "Pode ser." respondendo "Posso usar Outras despesas?" virou proposta
// de criar a categoria "Pode ser."; "Criar a categoria Salário." e "Confirmar
// agora a criação da categoria Salário." pediam para "confirmar a criação".
// Respostas de aceite curtas e o pedido de confirmar/criar o próprio item do
// card (sem outro nome) passam a confirmar.
const SPOKEN_CONFIRMATION_PATTERNS = [
  /^(?:pode\s+ser|isso\s+mesmo|isso\s+a[ií]|exato|exatamente|com\s+certeza|fechado|manda|pode\s+mandar|pode\s+fazer|pode\s+criar|pode\s+usar\s+essa)[.!]?$/,
  /^(?:pode\s+)?(?:confirmar|confirma|confirmo|criar|cria|registrar|registra|lancar|lanca|salvar|salva)\s+(?:(?:agora|ja|entao)\s+)?(?:(?:o|a)\s+)?(?:criacao\s+d[aoe]\s+)?(?:(?:essa|esta|nova)\s+)?(?:conta|categoria|lancamento|registro|movimentacao|despesa|receita|transferencia|gasto)[.!]?$/,
];

// Cortesia e pressa no fim da frase não mudam a resposta: "confirmar já",
// "pode confirmar agora, por favor".
const TRAILING_COURTESY = /(?:[,\s]+(?:agora|ja|por\s+favor|pra\s+mim|para\s+mim|entao|mesmo))+[.!]?$/;

function removeTrailingSubject(text, subjectName) {
  const subject = normalizeFinancialText(subjectName).replace(/[.!?]+$/g, '');
  if (!subject || !text.endsWith(subject)) return text;
  const rest = text.slice(0, -subject.length);
  return /(?:^|\s)$/.test(rest) ? rest.trim() : text;
}

// subjectName: nome da conta/categoria que o card propõe. Só esse nome pode
// vir junto do pedido ("criar a categoria Salário"); outro nome é resposta
// ao campo, nunca confirmação.
export function classifyPendingActionReply(value, { subjectName = null } = {}) {
  const fullReply = normalizeFinancialText(value).replace(/[!?]+$/g, '');
  const withoutCourtesy = fullReply.replace(TRAILING_COURTESY, '').replace(/[.!,]+$/g, '').trim() || fullReply;
  const normalized = fullReply.replace(AFFIRMATIVE_OPENING, '') || fullReply;
  const spoken = removeTrailingSubject(
    withoutCourtesy.replace(AFFIRMATIVE_OPENING, '') || withoutCourtesy,
    subjectName,
  );
  if (CONFIRMATION_PATTERNS.some((pattern) => pattern.test(fullReply) || pattern.test(normalized) || pattern.test(spoken))) return 'confirm';
  if (SPOKEN_CONFIRMATION_PATTERNS.some((pattern) => pattern.test(spoken))) return 'confirm';
  if (CANCELLATION_PATTERNS.some((pattern) => pattern.test(normalized) || pattern.test(spoken))) return 'cancel';
  if (CANCELLATION_CONTAINS_PATTERNS.some((pattern) => pattern.test(normalized))) return 'cancel';
  return 'input';
}

export function resolvePendingActionInput({
  value,
  action,
  accounts = [],
  categories = [],
  workspaceId = null,
  referenceDate,
} = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || !action) return { kind: 'invalid', overrides: null };

  const firstIssue = action.issues?.[0]?.field ?? null;
  const normalized = normalizeFinancialText(text);
  const parsed = parseFinancialText(text, { referenceDate });
  const explicitField = /\b(?:valor|quantia)\b/.test(normalized) ? 'amount'
    : /\b(?:conta destino|destino)\b/.test(normalized) ? 'destinationAccount'
      : /\bconta\b/.test(normalized) ? 'account'
        : /\bcategoria\b/.test(normalized) ? 'category'
          : /\bdata\b/.test(normalized) ? 'date'
            : /\b(?:descricao|descrição|identificar)\b/.test(normalized) ? 'description'
              : null;
  const field = explicitField ?? firstIssue;
  const result = resolveForField(field, { text, parsed, accounts, categories, workspaceId });
  // BUG REAL EM PRODUÇÃO (voz): com o card na tela, "muda pra cento e
  // cinquenta", "foi no Nubank" ou "na verdade foi ontem" não citam o nome
  // do campo e recebiam "informe o campo que deseja corrigir". Sem campo
  // pendente, ou com marcador de correção, a frase vale por todos os campos
  // que ela traz ("troca pra alimentação e a data pra anteontem").
  // Frase que cita outro campo além do pendente também vale por todos: com a
  // Uni perguntando o valor, "despesa de cinco mil reais com a categoria
  // Impostos" entrega o valor junto com a categoria.
  const collected = !firstIssue || looksLikePendingCorrection(text)
    || (explicitField !== null && explicitField !== firstIssue)
    ? collectCorrectionOverrides({ text, normalized, parsed, accounts, categories, workspaceId })
    : null;
  // Troca de tipo ("não é despesa, é receita"): ganha do campo pendente, que
  // trataria "Salário" como resposta de categoria do tipo antigo. A categoria
  // citada só vale se for do tipo novo; senão sai e é reavaliada pelo nome.
  // Com a pergunta "receita ou saldo?" pendente, a resposta é a intenção.
  const typeCorrection = field !== 'intent' && isTypeSwitchableAction(action)
    ? resolveTransactionTypeCorrection(text)
    : null;
  if (typeCorrection) {
    const overrides = {
      ...collected,
      ...(result.kind === 'correction' ? result.overrides : {}),
      transactionType: typeCorrection,
    };
    const chosenCategory = overrides.categoryId
      ? (Array.isArray(categories) ? categories : []).find((category) => category?.id === overrides.categoryId)
      : null;
    // A categoria de antes é do tipo antigo. "undefined" explícito (e não só
    // tirar a chave) é o que apaga o id que o hook já guardou nos overrides.
    if (action.transactionType !== typeCorrection && chosenCategory?.category_type !== typeCorrection) {
      overrides.categoryId = undefined;
    }
    return { kind: 'correction', overrides };
  }
  if (result.kind === 'correction') {
    return collected ? { ...result, overrides: { ...collected, ...result.overrides } } : result;
  }
  // "A categoria é Pets" com outro campo na frase: o pedido de categoria
  // nova vem primeiro; o resto não pode apagá-lo. Os outros campos ("foi
  // ontem") seguem em overrides para o rascunho voltar com eles.
  if (result.kind === 'category_not_found' && result.requestedCategoryName) {
    const otherOverrides = { ...collected };
    delete otherOverrides.categoryId;
    return Object.keys(otherOverrides).length ? { ...result, overrides: otherOverrides } : result;
  }
  if (collected) return { kind: 'correction', overrides: collected };

  // BUG REAL (contexto/correção perdidos): a Uni pergunta um campo (ex.:
  // "Em qual conta?") mas o usuário responde corrigindo OUTRO campo já
  // preenchido antes ("na verdade foram 55", "corrige para 80") -- sem
  // esta rede, o texto era testado só contra o campo pendente (conta),
  // nunca batia com nenhuma conta real, e virava "não encontrei essa
  // conta" ou uma proposta de criar uma conta chamada "na verdade foram
  // 55". Only kicks in quando a tentativa no campo pendente FALHOU e o
  // texto inteiro não é nada além de uma expressão de valor (nunca
  // reinterpreta uma resposta legítima de conta/categoria que só por
  // acaso contém um número). Preserva tudo que já foi confirmado antes
  // (mercado/despesa/etc.) -- só o valor muda; o campo que estava
  // realmente pendente (conta) continua pendente e volta a ser
  // perguntado no próximo turno (buildAction re-deriva os issues a
  // partir dos overrides acumulados).
  if (field !== 'amount' && looksLikePureAmountCorrection(text, parsed)) {
    const amountResult = resolveForField('amount', { text, parsed, accounts, categories, workspaceId });
    if (amountResult.kind === 'correction') return amountResult;
  }

  return result;
}

// BUG REAL EM PRODUÇÃO (voz): com o card na tela, "A categoria é Animais de
// Estimação." e "só que com a categoria Animais de Estimação" não achavam
// categoria e caíam em "quer continuar ou falar de outra coisa?", em loop.
// O nome é o que vem depois de "categoria", sem os conectivos. Referência ao
// próprio registro ("a categoria do registro") não é nome.
// Artigo e "de" também saem: "é de lazer" pede "lazer", e "a Pets" pede
// "Pets". "do"/"da" ficam, porque marcam referência ao registro.
const CATEGORY_NAME_LEAD = /^(?:(?::|(?:é|e|eh|seja|sera|será|vai\s+ser|fica|ficar|tem\s+que\s+ser|para|pra|por|como|nova|novo|chamada|chamado|com\s+o\s+nome(?:\s+de)?|a|o|de)(?=[\s:]|$))[\s:]*)+/i;
const CATEGORY_NAME_TAIL = /(?:[,\s]+(?:por\s+favor|pra\s+mim|para\s+mim|agora|ta|tá|ok))+\s*$/i;
const CATEGORY_REFERENCE_START = /^(?:do|da|dos|das|desse|dessa|deste|desta|disso|dele|dela|que|atual|certa|errada|outra|outro|diferente|ta|tá|esta|está|estava|ficou|nao|não)(?=\s|$)/i;
const CATEGORY_NAME_MAX_LENGTH = 40;
const CATEGORY_NAME_MAX_WORDS = 5;
// BUG REAL EM PRODUÇÃO (voz, 11/10/2026): "Quero criar uma categoria chamada
// 'Impostos' para vincular essa despesa." criou a categoria "Impostos' para
// vincular essa despesa". Nome entre aspas é o nome inteiro; a finalidade
// ("para vincular essa despesa", "pra esse gasto") não faz parte dele.
// "Presentes para a família" continua inteiro.
const CATEGORY_QUOTED_NAME = /^["“'‘]([^"“”'‘’]+)["”'’]/;
const CATEGORY_NAME_PURPOSE = /\s+(?:para|pra)\s+(?:vincular|usar|colocar|lan[cç]ar|registrar|associar|ligar|classificar|esse|essa|este|esta|isso|ele|ela|o\s+(?:lan[cç]amento|gasto|registro|rascunho)|a\s+(?:despesa|receita|sa[ií]da|entrada|movimenta[cç][aã]o|compra))(?=\s|$).*$/i;

export function extractRequestedCategoryName(value) {
  const text = typeof value === 'string' ? value : '';
  const match = text.match(/\bcategoria\b(.*)$/i);
  if (!match) return '';
  const lead = match[1].trim().replace(CATEGORY_NAME_LEAD, '');
  const quoted = lead.match(CATEGORY_QUOTED_NAME)?.[1];
  const name = (quoted ?? lead
    // Outra oração ("e foi ontem", "e no Nubank") não faz parte do nome;
    // "Casa e Jardim" faz.
    .split(/[,;]|\s+e\s+(?=(?:o|a|os|as|foi|era|é|eh|no|na|pelo|pela|com|em|ontem|hoje|anteontem|data|valor|conta)(?:\s|$))/i)[0]
    .replace(/[.!?]+\s*$/g, '')
    .replace(CATEGORY_NAME_PURPOSE, '')
    .trim()
    .replace(CATEGORY_NAME_LEAD, '')
    .replace(CATEGORY_NAME_TAIL, ''))
    .replace(/^["“”']+|["“”'.!?]+$/g, '')
    .trim();
  if (!name || CATEGORY_REFERENCE_START.test(name)) return '';
  if (name.length > CATEGORY_NAME_MAX_LENGTH || name.split(/\s+/).length > CATEGORY_NAME_MAX_WORDS) return '';
  return name;
}

// Ajuste falado de um rascunho em andamento. Ganha do detector de
// lançamento novo: "na verdade paguei 150 reais" e "coloca o valor de 150
// reais" têm verbo e valor, mas corrigem o card em vez de abrir outro.
const PENDING_CORRECTION_PATTERNS = [
  /^(?:nao[,.]?\s+)*(?:na verdade|na real|corrige|corrigir|corrija|muda|mudar|mude|altera|alterar|altere|troca|trocar|troque|ajusta|ajustar|ajuste|substitui|substituir|edita|editar|edite)\b/,
  /\b(?:em vez de|ao inves de|no lugar de)\b/,
  /^(?:nao[,.]?\s+)*(?:o|a)\s+(?:valor|data|categoria|conta|descricao)\s+(?:e|era|foi|fica|vai ser|tem que ser)\b/,
  /\b(?:coloca|coloque|bota|poe|deixa|deixe)\s+(?:o|a)\s+(?:valor|data|categoria|conta|descricao)\b/,
];

export function looksLikePendingCorrection(value) {
  const normalized = normalizeFinancialText(value);
  if (!normalized) return false;
  return PENDING_CORRECTION_PATTERNS.some((pattern) => pattern.test(normalized))
    || Boolean(resolveTransactionTypeCorrection(value));
}

// BUG REAL EM PRODUÇÃO (voz): "Salário não é despesa, salário é uma receita."
// com o card na tela não mudava nada, porque o tipo (entrada/saída) não era um
// campo corrigível. Reconhece a troca de tipo dita de forma direta e devolve
// 'income' ou 'expense'; null quando a frase não fala do tipo.
//
// O texto chega sem acento, então "é" e a conjunção "e" são iguais. Para não
// tomar "gastei no mercado e gasto na padaria" nem "a descrição é gasto com
// combustível" por troca de tipo, o tipo precisa fechar a oração ("é receita.",
// "é uma despesa, não é receita") e não pode ser resposta de campo ("a
// categoria é Receita"). "receita de vendas" e "entrada do apartamento" são
// nomes, não troca de tipo.
const TYPE_WORD = String.raw`(receita|entrada|rendimento|ganho|despesa|saida|gasto)`;
const NOT_A_FIELD_ANSWER = String.raw`(?<!\b(?:categoria|conta|descricao|valor|data|nome|destino)\s+(?:nao\s+)?)`;
const CLAUSE_END = String.raw`(?=\s*(?:[,.;!?]|$)|\s+(?:mesmo|ne|ok|sim|entao|por favor|pra mim|para mim|aqui|ai)\b)`;
const LINKED_TYPE = new RegExp(
  String.raw`${NOT_A_FIELD_ANSWER}\b(nao\s+)?(?:e|eh|foi|era|seria)\s+(?:uma?\s+|a\s+|o\s+)?${TYPE_WORD}\b${CLAUSE_END}`,
  'g',
);
const COMMANDED_TYPE = new RegExp(
  String.raw`\b(?:muda|mude|mudar|troca|troque|trocar|altera|altere|alterar|coloca|coloque|bota|deixa|deixe|registra|registre|lanca|lance|anota|anote|passa|passe|marca|marque)\s+(?:isso\s+|ela\s+|ele\s+|o\s+lancamento\s+|a\s+movimentacao\s+)?(?:como|pra|para|em)\s+(?:uma?\s+)?${TYPE_WORD}\b${CLAUSE_END}`,
  'g',
);
const INCOME_TYPE_WORDS = new Set(['receita', 'entrada', 'rendimento', 'ganho']);

export function resolveTransactionTypeCorrection(value) {
  const normalized = normalizeFinancialText(value);
  if (!normalized) return null;

  // A última afirmação vale: "não é despesa, é receita" e "é despesa, não é
  // receita" terminam cada uma no tipo certo.
  const decisions = [];
  for (const match of normalized.matchAll(LINKED_TYPE)) {
    const isIncome = INCOME_TYPE_WORDS.has(match[2]);
    decisions.push({ at: match.index, type: Boolean(match[1]) === isIncome ? 'expense' : 'income' });
  }
  for (const match of normalized.matchAll(COMMANDED_TYPE)) {
    decisions.push({ at: match.index, type: INCOME_TYPE_WORDS.has(match[1]) ? 'income' : 'expense' });
  }
  if (!decisions.length) return null;
  return decisions.sort((left, right) => left.at - right.at).at(-1).type;
}

function isTypeSwitchableAction(action) {
  return action?.intent === 'register_income' || action?.intent === 'register_expense';
}

export function collectCorrectionOverrides({ text, normalized, parsed, accounts, categories, workspaceId }) {
  const overrides = {};
  const date = parsed.entities.date;
  if (date) overrides.date = date;

  let amount = Number(parsed.entities.amount);
  // Número por extenso sem "reais" ("muda pra cento e cinquenta") só vira
  // valor quando a frase não fala de data.
  if (!(amount > 0) && !date && !/\b(?:dia|data)\b/.test(normalized)) {
    amount = Number(extractAmount(`${text.replace(/[.!?]+$/g, '')} reais`));
  }
  if (amount > 0 && !(date && /\b(?:dia|data)\b/.test(normalized) && !/\b(?:reais|real|r\$|valor)\b/.test(normalized))) {
    overrides.amount = amount;
  }

  const [account] = findMatches(accounts, text, ACCOUNT_IDENTITY_FIELDS, workspaceId)
    .filter((item) => normalized.includes(normalizeFinancialText(item.name)));
  if (account) overrides.accountId = account.id;

  const [category] = findMatches(categories, text)
    .filter((item) => normalized.includes(normalizeFinancialText(item.name)));
  if (category) overrides.categoryId = category.id;

  return Object.keys(overrides).length ? overrides : null;
}

// Verdadeiro quando o texto inteiro é essencialmente "uma quantia e nada
// mais" (com marcadores de correção opcionais como "na verdade"/"corrige
// para"/"era"/"eram") -- nunca dispara para uma resposta de conta/categoria
// que só coincidentemente contém um número (ex.: "Conta 55" continua não
// batendo, porque "conta" sobra como conteúdo significativo após remover o
// valor e os marcadores).
const AMOUNT_CORRECTION_FILLER_WORDS = /\b(?:na verdade|de verdade|corrige|corrigir|corrigindo|corrigido|para|pra|foram|foi|era|eram|é|eh|na real|acho que|na verdade foram|na verdade era|R\$|reais?|rs)\b/g;

function looksLikePureAmountCorrection(text, parsed) {
  const amount = Number(parsed?.entities?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const normalized = normalizeFinancialText(text).replace(/[.,!?]+$/g, '');
  const withoutFillers = normalized.replace(AMOUNT_CORRECTION_FILLER_WORDS, ' ');
  const withoutNumbers = withoutFillers.replace(/[\d.,]+/g, ' ');
  const remainder = withoutNumbers.replace(/\s+/g, ' ').trim();
  return remainder.length === 0;
}

const DESCRIPTION_REQUEST_LEAD = /^(?:(?:n[ãa]o[,.]?\s+)*(?:muda|mude|mudar|troca|troque|trocar|altera|altere|alterar|corrige|corrija|corrigir|ajusta|ajuste|ajustar|coloca|coloque|bota|deixa|deixe|p[õo]e)\s+)?(?:(?:a|o)\s+)?(?:descri[cç][aã]o|identificar)\s*(?:(?:para|pra|por|como|de)\s+|[ée]\s+|:\s*)?/i;

function resolveForField(field, { text, parsed, accounts, categories, workspaceId }) {
  if (field === 'amount') {
    const amount = Number(parsed.entities.amount);
    return Number.isFinite(amount) && amount > 0
      ? { kind: 'correction', overrides: { amount } }
      : { kind: 'invalid', overrides: null };
  }

  if (field === 'account' || field === 'destinationAccount') {
    // BUG REAL: uma frase completa de lançamento respondida na pendência de
    // conta nunca é nome de conta. Duas formas de chegar aqui:
    // 1. enunciado autossuficiente ("Entrou mil reais.") -- o sendText já o
    //    abandona como fresh statement (looksLikeFreshFinancialStatement),
    //    e esta guarda é a defesa em profundidade para os pontos que não
    //    passam por lá;
    // 2. declaração com verbo e possessivo sem valor ("Entrou meu
    //    salário.") -- sem valor não é "fresh", mas também não é resposta
    //    de conta. Respostas reais de conta ("No Nubank", "Entrou no
    //    Nubank") nunca disparam esta guarda (não têm possessivo nem valor).
    const stripped = text.replace(/[.!?]+$/g, '').trim();
    const verbLedWithAmount = /^(?:entrou|caiu|entraram|cairam|recebi|ganhei|faturei|gastei|paguei|comprei)\b/i.test(stripped)
      && Number(parsed.entities.amount) > 0;
    const possessiveStatement = /^(?:entrou|caiu|entraram|cairam)\s+(?:meu|minha|meus|minhas)\b/i.test(stripped);
    if (verbLedWithAmount || possessiveStatement) {
      return { kind: 'invalid', overrides: null };
    }
    const availableAccounts = (Array.isArray(accounts) ? accounts : [])
      .filter((account) => account?.is_active !== false)
      .filter((account) => belongsToWorkspace(account, workspaceId));
    let matches = findMatches(accounts, text, ACCOUNT_IDENTITY_FIELDS, workspaceId);
    if (!matches.length) {
      // Camada de normalizacao de instituicoes financeiras (offline,
      // determinística): uma transcricao garbled como "foi no No Bank"
      // nao bate literalmente com a conta real "Nubank" -- tenta de novo
      // usando o nome canonico da instituicao antes de concluir que a
      // conta nao existe (nunca antes de tentar o texto original).
      const institutionMatch = normalizeFinancialInstitutionName(text, { hasAccountContext: true });
      if (institutionMatch.canonicalName) {
        matches = findMatches(accounts, institutionMatch.canonicalName, ACCOUNT_IDENTITY_FIELDS, workspaceId);
      }
    }
    if (matches.length > 1) {
      return { kind: 'ambiguous_account', accounts: matches, overrides: null };
    }
    if (!matches.length) {
      return { kind: 'account_not_found', accounts: availableAccounts, overrides: null };
    }
    const [account] = matches;
    return {
      kind: 'correction',
      overrides: field === 'destinationAccount'
        ? { destinationAccountId: account.id }
        : { accountId: account.id },
    };
  }

  if (field === 'category') {
    const availableCategories = (Array.isArray(categories) ? categories : [])
      .filter((category) => category?.is_active !== false);
    const requestedCategoryName = extractRequestedCategoryName(text);
    const [category] = findMatches(categories, requestedCategoryName || text);
    if (category) {
      return { kind: 'correction', overrides: { categoryId: category.id } };
    }
    return {
      kind: 'category_not_found',
      categories: availableCategories,
      requestedCategoryName: requestedCategoryName || null,
      overrides: null,
    };
  }

  if (field === 'date') {
    return parsed.entities.date
      ? { kind: 'correction', overrides: { date: parsed.entities.date } }
      : { kind: 'invalid', overrides: null };
  }

  if (field === 'description') {
    // "muda a descrição para almoço com a equipe" vira "almoço com a equipe":
    // o pedido não faz parte da descrição.
    const description = text
      .replace(DESCRIPTION_REQUEST_LEAD, '')
      .replace(/(?<!\betc)[.!?]+$/i, '')
      .trim();
    return description.length >= 2
      ? { kind: 'correction', overrides: { description } }
      : { kind: 'invalid', overrides: null };
  }

  if (field === 'intent') {
    // Decisão após "Tenho R$ 1.000?" (ambiguous_balance_or_income): a
    // resposta é a INTENÇÃO, nunca um campo da transação. Frase inteira
    // batendo com um dos dois lados; qualquer outra resposta mantém a
    // pendência (buildClarificationResponse re-explica a pergunta).
    // BUG REAL: só "receita"/"saldo"/"ajustar saldo" resolviam a
    // ambiguidade -- respostas naturais ("coloca no saldo", "foi uma
    // receita", "dinheiro recebido", "saldo atual") caíam em 'invalid' e a
    // Uni re-perguntava para sempre. Padrões novos são âncora COMPLETA de
    // frase (nunca um "includes" que arriscaria classificar um nome de
    // conta como intenção).
    const stripped = text.replace(/[.!?]+$/g, '').trim();
    if (/^(?:registrar\s+)?(?:como\s+)?receita$/i.test(stripped)
      || /^(?:registrar\s+)?(?:como\s+)?entrada$/i.test(stripped)
      || /^(?:é|e)\s+receita$/i.test(stripped)
      || /^income$/i.test(stripped)
      || /^(?:coloca|colocar|bota|botar|registra|registrar|lan[cç]a|lancar|anota|anotar)\s+como\s+(?:uma\s+)?(?:receita|entrada)$/i.test(stripped)
      || /^(?:foi|era)\s+(?:uma\s+)?receita$/i.test(stripped)
      || /^(?:dinheiro|valor|quantia)\s+recebid[oa]$/i.test(stripped)) {
      return { kind: 'correction', overrides: { intentDecision: 'register_income' } };
    }
    if (/^(?:ajustar\s+)?(?:o\s+)?saldo$/i.test(stripped)
      || /^(?:é|e)\s+saldo$/i.test(stripped)
      || /^saldo\s+m[êe]smo$/i.test(stripped)
      || /^balance$/i.test(stripped)
      || /^(?:no|o)\s+saldo$/i.test(stripped)
      || /^(?:quero\s+)?(?:ajustar|corrigir|atualizar)\s+(?:o\s+)?saldo$/i.test(stripped)
      || /^(?:coloca|colocar|bota|botar|deixa|deixar|define|definir)\s+(?:no|como|pra|para)\s+(?:o\s+)?saldo$/i.test(stripped)
      || /^como\s+saldo$/i.test(stripped)
      || /^saldo\s+atual$/i.test(stripped)) {
      return { kind: 'correction', overrides: { intentDecision: 'set_balance' } };
    }
    return { kind: 'invalid', overrides: null };
  }

  return { kind: 'invalid', overrides: null };
}
