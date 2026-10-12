import { normalizeSearchText } from '../../utils/searchText.js';
import { normalizeText } from './categoryUtils.js';

export const CATEGORY_ICON_GROUPS = Object.freeze({
  EXPENSE: 'expense',
  INCOME: 'income',
  GENERIC: 'generic',
});

function iconOption(key, label, group) {
  return Object.freeze({ key, label, group });
}

const EXPENSE_ICONS = Object.freeze([
  iconOption('food', 'Alimentação', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('groceries', 'Mercado', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('restaurant', 'Restaurante', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('home', 'Moradia', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('rent', 'Aluguel', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('condo', 'Condomínio', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('water', 'Água', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('energy', 'Energia', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('gas', 'Gás', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('internet', 'Internet', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('phone', 'Telefone', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('transport', 'Transporte', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('fuel', 'Combustível', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('parking', 'Estacionamento', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('toll', 'Pedágio', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('car-maintenance', 'Manutenção de veículo', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('health', 'Saúde', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('pharmacy', 'Farmácia', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('health-plan', 'Plano de saúde', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('personal-care', 'Beleza e cuidados', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('clothing', 'Vestuário', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('education', 'Educação', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('school-material', 'Material escolar', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('leisure', 'Lazer', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('games', 'Jogos', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('travel', 'Viagens', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('pets', 'Pets', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('subscription', 'Assinaturas', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('taxes', 'Impostos e taxas', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('debt', 'Dívidas', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('loan', 'Empréstimos', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('insurance', 'Seguros', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('gift', 'Presentes', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('shopping', 'Compras', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('electronics', 'Eletrônicos', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('home-maintenance', 'Manutenção da casa', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('services', 'Serviços', CATEGORY_ICON_GROUPS.EXPENSE),
  iconOption('other-expense', 'Outras saídas', CATEGORY_ICON_GROUPS.EXPENSE),
]);

const INCOME_ICONS = Object.freeze([
  iconOption('salary', 'Salário', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('work', 'Freelance', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('sales', 'Venda', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('commission', 'Comissão', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('bonus', 'Bônus', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('refund', 'Reembolso', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('home-income', 'Aluguel recebido', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('yield', 'Rendimentos', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('investment', 'Investimentos', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('dividends', 'Dividendos', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('retirement', 'Aposentadoria', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('benefits', 'Benefícios', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('pension', 'Pensão', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('gift-income', 'Presente recebido', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('transfer', 'Transferência recebida', CATEGORY_ICON_GROUPS.INCOME),
  iconOption('other-income', 'Outras entradas', CATEGORY_ICON_GROUPS.INCOME),
]);

const GENERIC_ICONS = Object.freeze([
  iconOption('person', 'Pessoa', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('people', 'Pessoas', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('company', 'Empresa', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('store', 'Loja', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('briefcase', 'Maleta', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('star', 'Estrela', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('heart', 'Coração', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('calendar', 'Calendário', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('box', 'Caixa', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('tag', 'Etiqueta', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('wallet', 'Carteira', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('coin', 'Moeda', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('card', 'Cartão', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('document', 'Documento', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('chart', 'Gráfico', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('check', 'Check', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('tool', 'Ferramenta', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('settings', 'Engrenagem', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('package', 'Pacote', CATEGORY_ICON_GROUPS.GENERIC),
  iconOption('location', 'Localização', CATEGORY_ICON_GROUPS.GENERIC),
]);

export const CATEGORY_ICON_OPTIONS = Object.freeze([
  ...EXPENSE_ICONS,
  ...INCOME_ICONS,
  ...GENERIC_ICONS,
]);

const ICON_OPTIONS_BY_GROUP = Object.freeze({
  [CATEGORY_ICON_GROUPS.EXPENSE]: EXPENSE_ICONS,
  [CATEGORY_ICON_GROUPS.INCOME]: INCOME_ICONS,
  [CATEGORY_ICON_GROUPS.GENERIC]: GENERIC_ICONS,
});

const GRUPO_POR_ICONE = Object.freeze(Object.fromEntries(
  CATEGORY_ICON_OPTIONS.map(({ key, group }) => [key, group]),
));

const LEGACY_ICON_KEYS = Object.freeze(['suppliers', 'operational']);
const KNOWN_ICON_KEYS = new Set([
  ...CATEGORY_ICON_OPTIONS.map(({ key }) => key),
  ...LEGACY_ICON_KEYS,
]);

const KEYWORD_TO_ICON = Object.freeze([
  [['aluguel recebido', 'renda de aluguel', 'locacao recebida'], 'home-income'],
  [['outras despesas', 'outra despesa', 'outras saidas', 'outra saida'], 'other-expense'],
  [['outras entradas', 'outra entrada'], 'other-income'],
  [['plano de saude', 'convenio medico'], 'health-plan'],
  [['material escolar', 'papelaria'], 'school-material'],
  [['manutencao de veiculo', 'oficina', 'mecanico'], 'car-maintenance'],
  [['manutencao da casa', 'reparo da casa'], 'home-maintenance'],
  [['presente recebido', 'doacao recebida'], 'gift-income'],
  [['transferencia recebida'], 'transfer'],
  [['reembolso', 'estorno', 'dinheiro de volta'], 'refund'],
  [['aposentadoria'], 'retirement'],
  [['beneficio', 'vale alimentacao', 'vale refeicao'], 'benefits'],
  [['pensao'], 'pension'],
  [['dividendo'], 'dividends'],
  [['investimento', 'aplicacao'], 'investment'],
  [['rendimento', 'juros'], 'yield'],
  [['comissao'], 'commission'],
  [['bonus', 'premiacao'], 'bonus'],
  [['freelance', 'autonomo', 'servico prestado', 'renda extra'], 'work'],
  [['salario', 'folha', 'holerite'], 'salary'],
  [['venda', 'receita de venda', 'faturamento'], 'sales'],
  [['emprestimo', 'financiamento'], 'loan'],
  [['divida', 'parcela de divida'], 'debt'],
  [['seguro'], 'insurance'],
  [['imposto', 'taxa', 'tributo'], 'taxes'],
  [['assinatura', 'streaming', 'mensalidade', 'recorrente'], 'subscription'],
  [['pet', 'animal', 'veterinario'], 'pets'],
  [['viagem', 'passagem', 'hotel'], 'travel'],
  [['jogo', 'game'], 'games'],
  [['lazer', 'entretenimento', 'passeio', 'diversao'], 'leisure'],
  [['educac', 'escola', 'curso', 'faculdade', 'estudo'], 'education'],
  [['roupa', 'vestuario', 'calcado'], 'clothing'],
  [['beleza', 'cuidados pessoais', 'salao'], 'personal-care'],
  [['farmacia', 'remedio', 'medicamento'], 'pharmacy'],
  [['saude', 'medico'], 'health'],
  [['combustivel', 'gasolina', 'etanol', 'diesel'], 'fuel'],
  [['estacionamento'], 'parking'],
  [['pedagio'], 'toll'],
  [['transporte', 'uber', 'onibus', 'carro', 'mobilidade'], 'transport'],
  [['telefone', 'celular'], 'phone'],
  [['internet', 'wifi'], 'internet'],
  [['energia', 'eletricidade', 'luz'], 'energy'],
  [['agua'], 'water'],
  [['condominio'], 'condo'],
  [['aluguel'], 'rent'],
  [['moradia', 'casa', 'imovel', 'habitacao'], 'home'],
  [['restaurante', 'lanchonete', 'delivery'], 'restaurant'],
  [['mercado', 'supermercado', 'feira'], 'groceries'],
  [['aliment', 'comida'], 'food'],
  [['eletronico', 'tecnologia'], 'electronics'],
  [['compra', 'shopping'], 'shopping'],
  [['presente'], 'gift'],
  [['servico'], 'services'],
]);

// Tela 10d: sugestões pelo nome. Cada palavra puxa vários ícones, em ordem
// de afinidade; `KEYWORD_TO_ICON` completa com o ícone único de cada palavra.
const PALAVRAS_PARA_SUGESTAO = Object.freeze([
  [['mercado', 'supermercado', 'feira', 'hortifruti', 'padaria', 'acougue'], ['groceries', 'food', 'restaurant', 'shopping', 'store']],
  [['aliment', 'comida', 'refeicao', 'almoco', 'jantar', 'cafe'], ['food', 'restaurant', 'groceries']],
  [['restaurante', 'lanchonete', 'delivery', 'ifood', 'lanche', 'bar'], ['restaurant', 'food', 'groceries']],
  [['moradia', 'casa', 'imovel', 'habitacao', 'lar'], ['home', 'rent', 'condo', 'home-maintenance', 'energy', 'water']],
  [['aluguel', 'locacao'], ['rent', 'home', 'home-income', 'condo']],
  [['condominio'], ['condo', 'home', 'rent']],
  [['agua', 'saneamento'], ['water', 'home', 'energy']],
  [['energia', 'eletricidade', 'luz'], ['energy', 'home', 'water']],
  [['gas'], ['gas', 'home', 'energy']],
  [['internet', 'wifi', 'fibra'], ['internet', 'phone', 'subscription', 'electronics']],
  [['telefone', 'celular', 'chip'], ['phone', 'internet', 'subscription', 'electronics']],
  [['transporte', 'uber', 'taxi', 'onibus', 'metro', 'carro', 'mobilidade', 'veiculo', 'moto'], ['transport', 'fuel', 'parking', 'toll', 'car-maintenance']],
  [['combustivel', 'gasolina', 'etanol', 'diesel', 'posto'], ['fuel', 'transport', 'car-maintenance', 'toll']],
  [['estacionamento'], ['parking', 'transport', 'toll']],
  [['pedagio'], ['toll', 'transport', 'fuel']],
  [['oficina', 'mecanico', 'revisao'], ['car-maintenance', 'transport', 'tool', 'fuel']],
  [['saude', 'medico', 'consulta', 'dentista', 'exame', 'hospital'], ['health', 'pharmacy', 'health-plan', 'heart']],
  [['farmacia', 'remedio', 'medicamento'], ['pharmacy', 'health', 'health-plan']],
  [['plano de saude', 'convenio'], ['health-plan', 'health', 'insurance', 'pharmacy']],
  [['beleza', 'cuidado', 'salao', 'cabelo', 'barbearia', 'estetica', 'academia'], ['personal-care', 'heart', 'shopping', 'health']],
  [['roupa', 'vestuario', 'calcado', 'sapato', 'tenis', 'moda'], ['clothing', 'shopping', 'store', 'personal-care']],
  [['educac', 'escola', 'curso', 'faculdade', 'estudo', 'livro', 'colegio'], ['education', 'school-material', 'document', 'subscription']],
  [['material escolar', 'papelaria'], ['school-material', 'education', 'box']],
  [['lazer', 'entretenimento', 'passeio', 'diversao', 'cinema', 'show', 'festa', 'balada'], ['leisure', 'games', 'travel', 'gift', 'restaurant']],
  [['jogo', 'game', 'videogame'], ['games', 'leisure', 'electronics', 'subscription']],
  [['viagem', 'passagem', 'hotel', 'ferias', 'turismo'], ['travel', 'leisure', 'transport', 'location']],
  [['pet', 'pets', 'animal', 'veterinario', 'cachorro', 'gato', 'racao'], ['pets', 'heart', 'health', 'groceries']],
  [['assinatura', 'streaming', 'mensalidade', 'recorrente', 'netflix', 'spotify', 'app'], ['subscription', 'internet', 'electronics', 'games', 'card']],
  [['imposto', 'taxa', 'taxas', 'tributo', 'iptu', 'ipva', 'tarifa'], ['taxes', 'document', 'home', 'transport']],
  [['divida', 'fatura', 'cartao'], ['debt', 'card', 'loan', 'wallet']],
  [['emprestimo', 'financiamento', 'consorcio', 'banco'], ['loan', 'debt', 'home', 'transport', 'card']],
  [['seguro'], ['insurance', 'health-plan', 'transport', 'home']],
  [['presente', 'doacao', 'aniversario', 'natal'], ['gift', 'gift-income', 'heart', 'shopping']],
  [['compra', 'shopping', 'loja'], ['shopping', 'store', 'clothing', 'electronics', 'card']],
  [['eletronico', 'tecnologia', 'computador', 'notebook', 'informatica'], ['electronics', 'phone', 'internet', 'games']],
  [['manutencao', 'reparo', 'reforma', 'conserto', 'obra'], ['home-maintenance', 'tool', 'car-maintenance', 'services']],
  [['servico', 'faxina', 'diarista', 'profissional'], ['services', 'tool', 'person', 'briefcase']],
  [['salario', 'folha', 'holerite', 'emprego', 'trabalho'], ['salary', 'work', 'briefcase', 'company', 'bonus']],
  [['freelance', 'autonomo', 'bico', 'renda extra', 'projeto'], ['work', 'briefcase', 'salary', 'sales']],
  [['venda', 'faturamento', 'cliente', 'pedido'], ['sales', 'store', 'tag', 'commission']],
  [['comissao'], ['commission', 'sales', 'salary']],
  [['bonus', 'premiacao', 'premio', 'plr'], ['bonus', 'salary', 'star']],
  [['reembolso', 'estorno', 'devolucao'], ['refund', 'card', 'wallet']],
  [['rendimento', 'juros', 'poupanca', 'cdb', 'tesouro'], ['yield', 'investment', 'dividends', 'coin']],
  [['investimento', 'aplicacao', 'acao', 'acoes', 'fundo', 'cripto', 'bitcoin'], ['investment', 'yield', 'dividends', 'chart']],
  [['dividendo', 'provento'], ['dividends', 'investment', 'yield']],
  [['aposentadoria', 'inss'], ['retirement', 'pension', 'salary']],
  [['beneficio', 'vale', 'auxilio', 'bolsa'], ['benefits', 'salary', 'card']],
  [['pensao', 'mesada'], ['pension', 'person', 'people', 'transfer']],
  [['transferencia', 'pix', 'ted'], ['transfer', 'wallet', 'card', 'coin']],
  [['pessoa', 'familia', 'filho', 'crianca', 'bebe'], ['people', 'person', 'heart', 'gift']],
  [['empresa', 'negocio', 'cnpj', 'mei'], ['company', 'briefcase', 'work', 'taxes']],
]);

// Sem nome, os ícones mais usados de cada tipo.
const ICONES_COMUNS_POR_TIPO = Object.freeze({
  income: Object.freeze(['salary', 'work', 'sales', 'investment', 'refund', 'other-income']),
  expense: Object.freeze(['groceries', 'food', 'home', 'transport', 'health', 'leisure']),
});

export const LIMITE_ICONES_SUGERIDOS = 6;

// Plural em -ões, -ães, -éis e -ais vira singular dos dois lados: "Comissões"
// casa com "comissao", "Aluguéis" com "aluguel". Só em palavra de 5 letras ou
// mais, para "mais", "seis" e "pais" ficarem como estão.
function singularizar(token) {
  if (token.length < 5) return token;
  if (token.endsWith('oes') || token.endsWith('aes')) return `${token.slice(0, -3)}ao`;
  if (token.endsWith('eis')) return `${token.slice(0, -3)}el`;
  if (token.endsWith('ais')) return `${token.slice(0, -3)}al`;
  return token;
}

// Sem acento, sem caixa, separado por tudo que não é letra ou número
// ("Luz/Água" vira "luz" e "agua") e no singular.
function tokensDoTexto(texto) {
  return normalizeSearchText(texto)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singularizar);
}

function prepararPalavra(palavra) {
  const tokens = tokensDoTexto(palavra);
  return tokens.length > 1 ? { frase: tokens.join(' ') } : { palavra: tokens[0] ?? '' };
}

// As três fontes normalizadas uma vez, no carregamento do módulo: o mapa de
// sugestão, o mapa de um ícone por palavra e o nome de cada ícone.
const TABELA_SUGESTAO = Object.freeze([
  ...PALAVRAS_PARA_SUGESTAO,
  ...KEYWORD_TO_ICON.map(([palavras, chave]) => [palavras, [chave]]),
  ...CATEGORY_ICON_OPTIONS.map(({ key, label }) => [[label], [key]]),
].map(([palavras, chaves]) => Object.freeze({
  palavras: Object.freeze(palavras.map(prepararPalavra).filter(({ palavra, frase }) => palavra || frase)),
  chaves: Object.freeze([...chaves]),
})));

// Palavra curta ("gas", "luz", "casa") só casa inteira: "gastos" não é gás
// nem "casamento" é moradia. Palavra longa casa como prefixo da palavra
// digitada ("mercados", "alimentacao").
const TAMANHO_PALAVRA_CURTA = 4;
// A última palavra, a que ainda está sendo digitada, também casa pelo começo
// ("merc" já sugere Mercado), a partir de 4 letras: com 3, "mes" virava
// mesada e "dia" virava diarista. As palavras anteriores já estão completas.
const MINIMO_DIGITACAO_PARCIAL = 4;

function casaPalavraInteira(palavra, token) {
  if (palavra.length <= TAMANHO_PALAVRA_CURTA) return token === palavra;
  return token.startsWith(palavra);
}

function casaEntrada({ palavra, frase }, nomeNormalizado, tokens, ultimo) {
  if (frase) return nomeNormalizado.includes(frase);
  if (tokens.some((token) => casaPalavraInteira(palavra, token))) return true;
  return ultimo.length >= MINIMO_DIGITACAO_PARCIAL
    && palavra.length > ultimo.length
    && palavra.startsWith(ultimo);
}

/**
 * Tela 10d: até seis ícones sugeridos a partir do nome digitado. Nome e
 * tabelas passam pela mesma normalização (sem acento, sem caixa, singular).
 * Sem nome ou sem palavra conhecida, devolve os ícones mais comuns do tipo.
 * `manter` é o ícone que a pessoa escolheu e continua à vista. Sem escolha,
 * a folha não passa `manter` e a linha fica só com sugestões.
 *
 * Retorna `{ icones, porNome, automatico }`. `porNome` diz se o nome casou
 * com alguma palavra. `automatico` é o ícone que a folha usa enquanto a
 * pessoa não escolhe: o primeiro sugerido pelo nome que não seja do outro
 * tipo, ou o padrão do tipo.
 */
export function sugerirIconesCategoria(nome, categoryType, { manter = null } = {}) {
  const tokens = tokensDoTexto(nome);
  const nomeNormalizado = tokens.join(' ');
  const ultimo = tokens.at(-1) ?? '';
  const icones = [];
  const adicionar = (chave) => {
    if (!icones.includes(chave) && KNOWN_ICON_KEYS.has(chave)) icones.push(chave);
  };

  if (tokens.length > 0) {
    for (const { palavras, chaves } of TABELA_SUGESTAO) {
      if (palavras.some((entrada) => casaEntrada(entrada, nomeNormalizado, tokens, ultimo))) {
        chaves.forEach(adicionar);
      }
    }
  }

  const porNome = icones.length > 0;
  // "Aluguel" como Entrada abre com Aluguel recebido, não com o de Saída: se o
  // nome trouxe ícone do tipo atual, os do outro tipo vão para o fim. Se não
  // trouxe ("Investimento" como Saída), a ordem de afinidade fica como está.
  const grupoDoTipo = categoryType === 'income' ? CATEGORY_ICON_GROUPS.INCOME : CATEGORY_ICON_GROUPS.EXPENSE;
  const grupoOposto = grupoDoTipo === CATEGORY_ICON_GROUPS.INCOME
    ? CATEGORY_ICON_GROUPS.EXPENSE
    : CATEGORY_ICON_GROUPS.INCOME;
  if (icones.some((chave) => GRUPO_POR_ICONE[chave] === grupoDoTipo)) {
    const doOutroTipo = (chave) => (GRUPO_POR_ICONE[chave] === grupoOposto ? 1 : 0);
    icones.sort((a, b) => doOutroTipo(a) - doOutroTipo(b));
  }
  // Ícone do outro tipo nunca vira automático: "Investimento" como Saída
  // sugere o gráfico de investimento, mas só grava se a pessoa tocar nele.
  const automatico = icones.find((chave) => GRUPO_POR_ICONE[chave] !== grupoOposto)
    ?? getDefaultCategoryIconKey(categoryType);

  const comuns = ICONES_COMUNS_POR_TIPO[categoryType] ?? ICONES_COMUNS_POR_TIPO.expense;
  comuns.forEach(adicionar);

  const lista = icones.slice(0, LIMITE_ICONES_SUGERIDOS);
  if (manter && KNOWN_ICON_KEYS.has(manter) && !lista.includes(manter)) {
    lista[LIMITE_ICONES_SUGERIDOS - 1] = manter;
  }
  return Object.freeze({ icones: Object.freeze(lista), porNome, automatico });
}

const ICON_TONES = Object.freeze({
  food: 'orange', groceries: 'orange', restaurant: 'orange',
  home: 'green', rent: 'green', condo: 'green', 'home-income': 'green',
  water: 'cyan', energy: 'yellow', gas: 'orange', internet: 'cyan', phone: 'blue',
  transport: 'blue', fuel: 'orange', parking: 'blue', toll: 'yellow',
  health: 'red', pharmacy: 'red', 'health-plan': 'red', 'personal-care': 'purple',
  clothing: 'purple', education: 'yellow', leisure: 'purple', games: 'purple',
  travel: 'cyan', pets: 'orange', subscription: 'cyan', taxes: 'yellow',
  debt: 'red', loan: 'red', insurance: 'blue', gift: 'purple', shopping: 'purple',
  electronics: 'blue', salary: 'green', work: 'blue', sales: 'green',
  commission: 'green', bonus: 'yellow', refund: 'cyan', yield: 'green',
  investment: 'green', dividends: 'green', retirement: 'blue', benefits: 'green',
  pension: 'green', 'gift-income': 'purple', transfer: 'blue',
  'other-expense': 'gray', 'other-income': 'green',
});

export function isCategoryIconKey(value) {
  return KNOWN_ICON_KEYS.has(normalizeText(value));
}

export function getDefaultCategoryIconKey(categoryType) {
  if (categoryType === 'income') return 'other-income';
  if (categoryType === 'transfer') return 'transfer';
  return 'other-expense';
}

export function getCategoryIconSections(categoryType) {
  const preferredGroup = categoryType === 'income'
    ? CATEGORY_ICON_GROUPS.INCOME
    : CATEGORY_ICON_GROUPS.EXPENSE;
  const alternativeGroup = preferredGroup === CATEGORY_ICON_GROUPS.INCOME
    ? CATEGORY_ICON_GROUPS.EXPENSE
    : CATEGORY_ICON_GROUPS.INCOME;
  const typeLabel = preferredGroup === CATEGORY_ICON_GROUPS.INCOME ? 'Entrada' : 'Saída';
  const alternativeLabel = preferredGroup === CATEGORY_ICON_GROUPS.INCOME ? 'Saída' : 'Entrada';

  return Object.freeze([
    Object.freeze({
      id: preferredGroup,
      label: `Recomendados para ${typeLabel}`,
      options: ICON_OPTIONS_BY_GROUP[preferredGroup],
    }),
    Object.freeze({
      id: CATEGORY_ICON_GROUPS.GENERIC,
      label: 'Ícones genéricos',
      options: ICON_OPTIONS_BY_GROUP[CATEGORY_ICON_GROUPS.GENERIC],
    }),
    Object.freeze({
      id: alternativeGroup,
      label: `Também disponíveis: ${alternativeLabel}`,
      options: ICON_OPTIONS_BY_GROUP[alternativeGroup],
    }),
  ]);
}

export function resolveCategoryIconKey(category) {
  const explicit = normalizeText(category?.icon);
  if (isCategoryIconKey(explicit)) return explicit;

  const name = normalizeText(category?.name);
  if (name.includes('presente')) {
    return category?.category_type === 'income' ? 'gift-income' : 'gift';
  }
  for (const [keywords, iconKey] of KEYWORD_TO_ICON) {
    if (keywords.some((keyword) => name.includes(keyword))) return iconKey;
  }

  return getDefaultCategoryIconKey(category?.category_type);
}

export function resolveCategoryTone(category) {
  const iconKey = resolveCategoryIconKey(category);
  if (ICON_TONES[iconKey]) return ICON_TONES[iconKey];
  const option = CATEGORY_ICON_OPTIONS.find(({ key }) => key === iconKey);
  if (option?.group === CATEGORY_ICON_GROUPS.INCOME) return 'green';
  if (option?.group === CATEGORY_ICON_GROUPS.EXPENSE) return 'orange';
  return 'blue';
}
