import assert from 'node:assert/strict';
import test from 'node:test';
import { mediaDeSaidasMensais, periodoDaMediaDeSaidas, sugestoesDeMeta } from './sugestoesDeMeta.js';

function saida(data, valor) {
  return { transaction_date: data, transaction_type: 'expense', status: 'completed', amount: valor };
}

test('a média usa os 3 meses fechados antes do mês atual', () => {
  assert.deepEqual(periodoDaMediaDeSaidas(new Date(2026, 9, 12)), { dateFrom: '2026-07-01', dateTo: '2026-09-30' });
  assert.deepEqual(periodoDaMediaDeSaidas(new Date(2026, 1, 3)), { dateFrom: '2025-11-01', dateTo: '2026-01-31' });
});

test('a média de saídas divide só pelos meses com movimentação', () => {
  const tresMeses = [saida('2026-07-05', 3000), saida('2026-08-10', 2000), saida('2026-08-20', 1000), saida('2026-09-01', 3000)];
  assert.equal(mediaDeSaidasMensais(tresMeses), 3000);

  const umMes = [saida('2026-09-01', 2500)];
  assert.equal(mediaDeSaidasMensais(umMes), 2500);

  const mesSoComEntrada = [
    { transaction_date: '2026-07-05', transaction_type: 'income', status: 'completed', amount: 5000 },
    saida('2026-08-10', 3000),
    saida('2026-09-01', 3000),
  ];
  assert.equal(mediaDeSaidasMensais(mesSoComEntrada), 3000);
});

test('entradas não entram na média e sem saídas não há média', () => {
  const soEntradas = [{ transaction_date: '2026-09-01', transaction_type: 'income', status: 'completed', amount: 5000 }];
  assert.equal(mediaDeSaidasMensais(soEntradas), null);
  assert.equal(mediaDeSaidasMensais([]), null);
});

test('a reserva sugerida é a média de saídas vezes 6', () => {
  const [reserva, divida, viagem] = sugestoesDeMeta(3000.5);
  assert.equal(reserva.tipo, 'emergency_reserve');
  assert.equal(reserva.alvo, 18003);
  assert.equal(divida.tipo, 'pay_debt');
  assert.equal(viagem.tipo, 'travel');
});

test('sem média, a reserva vai sem valor', () => {
  assert.equal(sugestoesDeMeta(null)[0].alvo, null);
});
