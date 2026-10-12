import { summarizeMonth } from '../simplified-app/simplifiedRecordsData.js';
import { dataIsoLocal } from './criacaoDeMeta.js';

// Sugestões do estado vazio de Metas (handoff 08h, #155). Cada uma abre o
// passo 2 da criação com o tipo e, quando dá para calcular, o valor.

export const MESES_DA_MEDIA_DE_SAIDAS = 3;
export const MESES_DA_RESERVA = 6;

// Os 3 meses fechados antes do mês atual. O mês corrente fica de fora
// porque ainda não terminou e puxaria a média para baixo.
export function periodoDaMediaDeSaidas(hoje = new Date()) {
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - MESES_DA_MEDIA_DE_SAIDAS, 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
  return { dateFrom: dataIsoLocal(inicio), dateTo: dataIsoLocal(fim) };
}

// Média das saídas por mês, contando só os meses com movimentação: quem
// começou a usar o app no mês passado não tem a média dividida por 3.
// Usa summarizeMonth, a mesma soma do Financeiro (com os ajustes de saída).
export function mediaDeSaidasMensais(transacoes) {
  const porMes = new Map();
  for (const transacao of transacoes) {
    const mes = String(transacao.transaction_date ?? '').slice(0, 7);
    if (!mes) continue;
    if (!porMes.has(mes)) porMes.set(mes, []);
    porMes.get(mes).push(transacao);
  }
  if (porMes.size === 0) return null;
  let total = 0;
  for (const doMes of porMes.values()) total += summarizeMonth(doMes).expense;
  const media = total / porMes.size;
  return media > 0 ? media : null;
}

export function sugestoesDeMeta(mediaDeSaidas) {
  const reserva = mediaDeSaidas ? Math.ceil(mediaDeSaidas * MESES_DA_RESERVA) : null;
  return [
    {
      tipo: 'emergency_reserve',
      titulo: 'Reserva de emergência',
      descricao: reserva
        ? 'Seis meses das suas saídas, pela média dos últimos 3 meses.'
        : 'Guarde o equivalente a seis meses das suas saídas.',
      alvo: reserva,
    },
    {
      tipo: 'pay_debt',
      titulo: 'Quitar dívida',
      descricao: 'Junte o valor para pagar uma dívida de uma vez.',
      alvo: null,
    },
    {
      tipo: 'travel',
      titulo: 'Viagem',
      descricao: 'Defina a data e veja quanto guardar por mês.',
      alvo: null,
    },
  ];
}
