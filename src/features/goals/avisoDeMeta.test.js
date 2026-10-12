import assert from 'node:assert/strict';
import test from 'node:test';
import { avisoDeMetaParaLeitura, primeiroDiaDoMes, TIPOS_DE_AVISO_DE_META } from './avisoDeMeta.js';

// O ritmo (goalCalc) olha o relógio de verdade: as datas das metas são
// relativas a hoje.
const HOJE = new Date();

function data(diasAPartirDeHoje) {
  const dia = new Date(HOJE.getFullYear(), HOJE.getMonth(), HOJE.getDate() + diasAPartirDeHoje);
  return `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`;
}

// formatCurrency separa "R$" do número com espaço não separável.
function texto(aviso) {
  if (!aviso) return null;
  return { ...aviso, titulo: aviso.titulo.replace(/\u00a0/g, ' '), detalhe: aviso.detalhe.replace(/\u00a0/g, ' ') };
}

function meta(campos = {}) {
  return {
    id: 'viagem',
    name: 'Viagem',
    status: 'active',
    target_amount: 12000,
    current_amount: 6000,
    start_date: data(-180),
    target_date: data(180),
    aportes_do_periodo: [],
    ...campos,
  };
}

test('todas no ritmo e sem marco no mês: sem aviso', () => {
  assert.equal(avisoDeMetaParaLeitura([meta()], HOJE), null);
  assert.equal(avisoDeMetaParaLeitura([], HOJE), null);
});

test('meta atrasada: avisa com o valor por mês para chegar na data', () => {
  const aviso = texto(avisoDeMetaParaLeitura([meta({ current_amount: 1000 })], HOJE));
  assert.equal(aviso.tipo, TIPOS_DE_AVISO_DE_META.ATRASADA);
  assert.equal(aviso.metaId, 'viagem');
  assert.equal(aviso.titulo, 'A meta Viagem está atrasada.');
  assert.match(aviso.detalhe, /^Guarde R\$ [\d.,]+ por mês para chegar em \p{L}+ de \d{4}\.$/u);
});

test('meta em atenção: até 15 pontos abaixo do esperado', () => {
  const aviso = texto(avisoDeMetaParaLeitura([meta({ current_amount: 5000 })], HOJE));
  assert.equal(aviso.tipo, TIPOS_DE_AVISO_DE_META.ATENCAO);
  assert.equal(aviso.titulo, 'A meta Viagem precisa de atenção.');
});

test('prazo vencido: diz quanto falta e quando era o prazo', () => {
  const aviso = texto(avisoDeMetaParaLeitura([
    meta({ start_date: data(-400), target_date: data(-40), current_amount: 9000 }),
  ], HOJE));
  assert.equal(aviso.tipo, TIPOS_DE_AVISO_DE_META.ATRASADA);
  assert.match(aviso.detalhe, /^Faltam R\$ 3\.000,00\. O prazo era \p{L}+ de \d{4}\.$/u);
});

test('pausada, concluída e arquivada não geram aviso', () => {
  const atrasada = { current_amount: 0 };
  assert.equal(avisoDeMetaParaLeitura([
    meta({ ...atrasada, status: 'paused' }),
    meta({ ...atrasada, status: 'completed' }),
    meta({ ...atrasada, archived_at: '2026-10-01T00:00:00Z' }),
  ], HOJE), null);
});

test('várias fora do ritmo: a atrasada vem antes e o detalhe conta as outras', () => {
  const aviso = texto(avisoDeMetaParaLeitura([
    meta({ id: 'carro', name: 'Carro', current_amount: 5000 }),
    meta({ id: 'casa', name: 'Casa', current_amount: 1000 }),
    meta({ id: 'curso', name: 'Curso', current_amount: 4000 }),
  ], HOJE));
  assert.equal(aviso.metaId, 'casa');
  assert.match(aviso.detalhe, / 2 outras metas também estão fora do ritmo\.$/);

  const duas = texto(avisoDeMetaParaLeitura([
    meta({ id: 'carro', name: 'Carro', current_amount: 5000 }),
    meta({ id: 'casa', name: 'Casa', current_amount: 1000 }),
  ], HOJE));
  assert.match(duas.detalhe, / 1 outra meta também está fora do ritmo\.$/);
});

test('marco de 50% passado com aporte deste mês', () => {
  const aviso = texto(avisoDeMetaParaLeitura([
    meta({ current_amount: 6500, aportes_do_periodo: [{ amount: 1000, contribution_date: primeiroDiaDoMes(HOJE) }] }),
  ], HOJE));
  assert.equal(aviso.tipo, TIPOS_DE_AVISO_DE_META.MARCO);
  assert.equal(aviso.titulo, 'Você já guardou metade da meta Viagem.');
  assert.equal(aviso.detalhe, 'Faltam R$ 5.500,00 para chegar a R$ 12.000,00.');
});

test('marco de 100% pede para concluir e vence o de 50%', () => {
  const aviso = texto(avisoDeMetaParaLeitura([
    meta({ id: 'a', current_amount: 6500, aportes_do_periodo: [{ amount: 1000, contribution_date: primeiroDiaDoMes(HOJE) }] }),
    meta({ id: 'b', name: 'Casa', current_amount: 12000, aportes_do_periodo: [{ amount: 2000, contribution_date: primeiroDiaDoMes(HOJE) }] }),
  ], HOJE));
  assert.equal(aviso.metaId, 'b');
  assert.equal(aviso.titulo, 'Você juntou todo o valor da meta Casa.');
  assert.equal(aviso.detalhe, 'Abra a meta e toque em Concluir meta.');
});

test('marco: já estava acima antes do mês, ou aporte de outro mês, não avisa', () => {
  assert.equal(avisoDeMetaParaLeitura([
    meta({ current_amount: 7000, aportes_do_periodo: [{ amount: 500, contribution_date: primeiroDiaDoMes(HOJE) }] }),
  ], HOJE), null);
  assert.equal(avisoDeMetaParaLeitura([
    meta({ current_amount: 6500, aportes_do_periodo: [{ amount: 1000, contribution_date: data(-40) }] }),
  ], HOJE), null);
});

test('retirada no mês que derruba abaixo de 50% não vira marco', () => {
  assert.equal(avisoDeMetaParaLeitura([
    meta({ current_amount: 6000, aportes_do_periodo: [{ amount: -1000, contribution_date: primeiroDiaDoMes(HOJE) }] }),
  ], HOJE), null);
});

test('fora do ritmo vence marco', () => {
  const aviso = avisoDeMetaParaLeitura([
    meta({ id: 'a', current_amount: 12000, aportes_do_periodo: [{ amount: 2000, contribution_date: primeiroDiaDoMes(HOJE) }] }),
    meta({ id: 'b', current_amount: 1000 }),
  ], HOJE);
  assert.equal(aviso.metaId, 'b');
});

test('primeiro dia do mês em AAAA-MM-DD', () => {
  assert.equal(primeiroDiaDoMes(new Date(2026, 0, 31)), '2026-01-01');
  assert.equal(primeiroDiaDoMes(new Date(2026, 11, 5)), '2026-12-01');
});
