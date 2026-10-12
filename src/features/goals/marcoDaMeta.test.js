import assert from 'node:assert/strict';
import test from 'node:test';
import { celebracaoDoMarco, maiorValorJaGuardado, marcoCruzado } from './marcoDaMeta.js';

// formatCurrency separa "R$" do número com espaço não separável.
function semEspacoFixo(texto) {
  return texto.replace(/\u00a0/g, ' ');
}

test('marcoCruzado celebra o aporte que passa de 50%', () => {
  assert.equal(marcoCruzado({ antes: 1200, depois: 2000, alvo: 4000 }), 50);
  assert.equal(marcoCruzado({ antes: 1999.99, depois: 2400, alvo: 4000 }), 50);
});

test('marcoCruzado celebra o aporte que chega a 100% ou passa dele', () => {
  assert.equal(marcoCruzado({ antes: 3200, depois: 4000, alvo: 4000 }), 100);
  assert.equal(marcoCruzado({ antes: 3200, depois: 4500, alvo: 4000 }), 100);
});

test('marcoCruzado fica com o maior marco quando um aporte cruza os dois', () => {
  assert.equal(marcoCruzado({ antes: 0, depois: 4000, alvo: 4000 }), 100);
});

test('marcoCruzado não celebra quando nenhum marco foi cruzado', () => {
  assert.equal(marcoCruzado({ antes: 500, depois: 1000, alvo: 4000 }), null);
  // Já estava acima de 50%: reabrir ou aportar de novo não repete a festa.
  assert.equal(marcoCruzado({ antes: 2000, depois: 2400, alvo: 4000 }), null);
  assert.equal(marcoCruzado({ antes: 4000, depois: 4400, alvo: 4000 }), null);
});

test('marcoCruzado usa o valor em reais, não o percentual arredondado', () => {
  // 49,6% arredonda para 50%, mas ainda não é a metade.
  assert.equal(marcoCruzado({ antes: 1000, depois: 1984, alvo: 4000 }), null);
});

test('marcoCruzado compara em centavos e não perde o alvo exato', () => {
  // 0,7 + 0,1 dá 0,7999999999999999 em ponto flutuante.
  assert.equal(marcoCruzado({ antes: 0.7, depois: 0.7 + 0.1, alvo: 0.8 }), 100);
});

test('marcoCruzado não celebra retirada', () => {
  assert.equal(marcoCruzado({ antes: 2400, depois: 1800, alvo: 4000 }), null);
  assert.equal(marcoCruzado({ antes: 2000, depois: 2000, alvo: 4000 }), null);
});

test('marcoCruzado ignora meta sem alvo e valor inválido', () => {
  assert.equal(marcoCruzado({ antes: 0, depois: 500, alvo: 0 }), null);
  assert.equal(marcoCruzado({ antes: 0, depois: 500, alvo: null }), null);
  assert.equal(marcoCruzado({ antes: undefined, depois: 500, alvo: 1000 }), null);
});

test('celebracaoDoMarco de 50% diz quanto falta e até quando', () => {
  const meta = { name: 'Viagem', status: 'active', current_amount: 2000, target_amount: 4000, target_date: '2026-12-31' };
  const celebracao = celebracaoDoMarco(meta, 50);
  assert.equal(celebracao.marco, 50);
  assert.equal(celebracao.titulo, '50% da meta Viagem');
  assert.equal(semEspacoFixo(celebracao.texto), 'Você guardou R$ 2.000,00. Faltam R$ 2.000,00 até dezembro de 2026.');
});

test('celebracaoDoMarco de 50% sem data-alvo diz só quanto falta', () => {
  const meta = { name: 'Reserva', status: 'active', current_amount: 5000, target_amount: 10000, target_date: null };
  assert.equal(semEspacoFixo(celebracaoDoMarco(meta, 50).texto), 'Você guardou R$ 5.000,00. Faltam R$ 5.000,00.');
});

test('celebracaoDoMarco de 100% leva a pessoa a concluir a meta', () => {
  const meta = { name: 'Viagem', status: 'active', current_amount: 4000, target_amount: 4000, target_date: '2026-12-31' };
  const celebracao = celebracaoDoMarco(meta, 100);
  assert.equal(celebracao.titulo, 'Meta alcançada');
  assert.equal(
    semEspacoFixo(celebracao.texto),
    'Você guardou R$ 4.000,00 para Viagem. Toque em Concluir meta para movê-la para Concluídas.',
  );
});

test('maiorValorJaGuardado refaz os aportes do mais antigo ao mais recente', () => {
  const meta = { current_amount: 1990 };
  // Do mais recente para o mais antigo: retirada de 10 depois de chegar a 2.000.
  const aportes = [{ amount: -10 }, { amount: 800 }, { amount: 1200 }];
  assert.equal(maiorValorJaGuardado(meta, aportes), 2000);
});

test('maiorValorJaGuardado conta o valor que não veio de aporte', () => {
  // A meta nasceu com 500 guardados e recebeu um aporte de 300.
  assert.equal(maiorValorJaGuardado({ current_amount: 800 }, [{ amount: 300 }]), 800);
  assert.equal(maiorValorJaGuardado({ current_amount: 500 }, []), 500);
});

test('voltar ao marco depois de uma retirada não celebra de novo', () => {
  const meta = { current_amount: 1990 };
  const aportes = [{ amount: -10 }, { amount: 2000 }];
  const antes = maiorValorJaGuardado(meta, aportes);
  assert.equal(marcoCruzado({ antes, depois: 2000, alvo: 4000 }), null);
  assert.equal(marcoCruzado({ antes, depois: 4000, alvo: 4000 }), 100);
});
