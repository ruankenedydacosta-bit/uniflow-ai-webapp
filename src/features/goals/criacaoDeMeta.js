import { formatCurrency } from '../../utils/formatters.js';

// Criação de meta em 3 passos (handoff 08b a 08d, #156). Funções puras;
// `hoje` entra por parâmetro para o teste fixar a data.

export const PASSOS_DA_CRIACAO = 3;

// Prazo máximo aceito no plano, nos dois modos: sem ele, um valor por mês
// muito pequeno ou um mês digitado no campo geraria uma data-alvo séculos
// à frente.
export const MESES_MAXIMOS_DO_PLANO = 600;

export const DIAS_DO_LEMBRETE = Object.freeze(Array.from({ length: 28 }, (_, indice) => indice + 1));

export const PRIORIDADES_DA_META = Object.freeze([
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Média' },
  { value: 'high', label: 'Alta' },
]);

export const MODOS_DO_PLANO = Object.freeze([
  { value: 'data', label: 'Data' },
  { value: 'mensal', label: 'Valor por mês' },
]);

// `nome` é o nome sugerido. Em Outra, a pessoa escreve o nome.
const TIPOS_PESSOAIS = Object.freeze([
  { value: 'emergency_reserve', label: 'Reserva de emergência', nome: 'Reserva de emergência' },
  { value: 'pay_debt', label: 'Quitar dívida', nome: 'Quitar dívida' },
  { value: 'travel', label: 'Viagem', nome: 'Viagem' },
  { value: 'property', label: 'Imóvel', nome: 'Imóvel' },
  { value: 'vehicle', label: 'Veículo', nome: 'Veículo' },
  { value: 'investment', label: 'Investimento', nome: 'Investimento' },
  { value: 'education', label: 'Educação', nome: 'Educação' },
  { value: 'other', label: 'Outra', nome: '' },
]);

const TIPO_EMPRESA = Object.freeze({ value: 'business', label: 'Empresa', nome: 'Empresa' });

// No espaço Empresa, o tipo Empresa ocupa o lugar de Educação.
export function tiposDeMeta(tipoDoEspaco) {
  if (tipoDoEspaco !== 'business') return TIPOS_PESSOAIS;
  return TIPOS_PESSOAIS.map((tipo) => (tipo.value === 'education' ? TIPO_EMPRESA : tipo));
}

const FORMATO_MES_ANO = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

function doisDigitos(numero) {
  return String(numero).padStart(2, '0');
}

export function dataIsoLocal(data) {
  return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
}

// "2027-03" do campo de mês. Devolve { ano, mes } com mes de 0 a 11.
function lerMes(valor) {
  const encontrado = /^(\d{4})-(\d{2})$/.exec(String(valor ?? ''));
  if (!encontrado) return null;
  const mes = Number(encontrado[2]) - 1;
  if (mes < 0 || mes > 11) return null;
  return { ano: Number(encontrado[1]), mes };
}

export function mesDoCampo(data) {
  return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}`;
}

export function somarMeses(hoje, meses) {
  return new Date(hoje.getFullYear(), hoje.getMonth() + meses, 1);
}

// A data-alvo é o último dia do mês do prazo: "até março" vale março
// inteiro. O último dia também evita que a leitura em UTC do goalCalc
// (new Date('2027-03-01') cai em fevereiro no Brasil) troque o mês.
function ultimoDiaDoMes(ano, mes) {
  return dataIsoLocal(new Date(ano, mes + 1, 0));
}

function mesesAteOMes(hoje, { ano, mes }) {
  return (ano - hoje.getFullYear()) * 12 + (mes - hoje.getMonth());
}

export function textoDoMes(ano, mes) {
  return FORMATO_MES_ANO.format(new Date(ano, mes, 1));
}

// Recalcula o plano a cada mudança do passo 2. Valores em reais.
// - modo 'data': o prazo (mês) define o valor por mês.
// - modo 'mensal': o valor por mês define o prazo.
// `entradasDoMes` nulo ou zero deixa o percentual de fora.
export function calcularPlano({ alvo, guardado = 0, modo, prazo, porMes, entradasDoMes, hoje = new Date() }) {
  // Subtração em centavos: 10,30 - 3,30 em ponto flutuante dá
  // 7.000000000000001, e o arredondamento para cima viraria R$ 8 por mês.
  const falta = Math.max(Math.round((Number(alvo || 0) - Number(guardado || 0)) * 100) / 100, 0);
  if (!(Number(alvo) > 0) || falta <= 0) return null;

  let meses;
  let mensal;
  if (modo === 'data') {
    const mesDoPrazo = lerMes(prazo);
    if (!mesDoPrazo) return null;
    meses = mesesAteOMes(hoje, mesDoPrazo);
    if (meses < 1) return null;
    mensal = Math.ceil(falta / meses);
  } else {
    mensal = Number(porMes || 0);
    if (!(mensal > 0)) return null;
    meses = Math.ceil(falta / mensal);
  }

  const fim = somarMeses(hoje, meses);
  const percentual = Number(entradasDoMes) > 0 ? Math.round((mensal / Number(entradasDoMes)) * 100) : null;

  return {
    falta,
    meses,
    porMes: mensal,
    dataAlvo: ultimoDiaDoMes(fim.getFullYear(), fim.getMonth()),
    textoDoPrazo: textoDoMes(fim.getFullYear(), fim.getMonth()),
    percentualDasEntradas: percentual,
  };
}

export function fraseDoPlano(plano, modo) {
  if (!plano) return null;
  const porMes = formatCurrency(plano.porMes);
  const principal = modo === 'data'
    ? `Guarde ${porMes} por mês para chegar lá em ${plano.textoDoPrazo}.`
    : `Guardando ${porMes} por mês, você chega lá em ${plano.textoDoPrazo}.`;
  if (plano.percentualDasEntradas === null) return principal;
  return `${principal} Isso é ${plano.percentualDasEntradas}% das suas entradas deste mês.`;
}

// Erro do passo, ou null quando dá para seguir.
export function erroDoPasso(passo, formulario, plano) {
  if (passo === 1) {
    return formulario.nome.trim() ? null : 'Escreva um nome para a meta.';
  }
  if (passo === 2) {
    if (!(formulario.alvo > 0)) return 'Informe o valor da meta.';
    if (formulario.guardado >= formulario.alvo) return 'O valor guardado já cobre a meta. Aumente o valor da meta.';
    if (formulario.modo === 'data') {
      if (!lerMes(formulario.prazo)) return 'Escolha o mês do prazo.';
      if (!plano) return 'Escolha um mês depois do atual.';
      if (plano.meses > MESES_MAXIMOS_DO_PLANO) return 'Escolha um prazo de até 50 anos.';
      return null;
    }
    if (!(formulario.porMes > 0)) return 'Informe quanto vai guardar por mês.';
    if (plano && plano.meses > MESES_MAXIMOS_DO_PLANO) {
      return 'Com esse valor por mês, a meta levaria mais de 50 anos. Aumente o valor por mês.';
    }
    return null;
  }
  return null;
}

// Payload de createGoal. `start_date` é o dia da criação no fuso do
// aparelho; o default do banco usaria o dia em UTC.
export function montarMetaParaCriar(formulario, plano, hoje = new Date()) {
  return {
    name: formulario.nome.trim(),
    category: formulario.tipo,
    target_amount: formulario.alvo,
    initial_amount: formulario.guardado,
    current_amount: formulario.guardado,
    planned_monthly_amount: plano.porMes,
    start_date: dataIsoLocal(hoje),
    target_date: plano.dataAlvo,
    priority: formulario.prioridade,
    status: 'active',
    linked_account_id: formulario.contaId || undefined,
    reminder_day: formulario.lembrete ? formulario.diaDoLembrete : undefined,
  };
}
