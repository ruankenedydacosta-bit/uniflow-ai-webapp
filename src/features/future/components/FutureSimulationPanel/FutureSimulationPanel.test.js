import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// Painel: três campos, textos de ajuste, sem ação de salvar
// ============================================================================

test('painel contem exatamente os tres campos de ajuste (sem metas nesta subfase)', async () => {
  const content = await source('FutureSimulationPanel.jsx');
  assert.match(content, /Ajuste nas entradas mensais/);
  assert.match(content, /Ajuste nas saídas mensais/);
  assert.match(content, /Ajuste no saldo inicial/);
  assert.doesNotMatch(content, /meta|Meta|goal/);
});

test('campos comecam vazios (equivalente a zero) e usam rascunho local, nao direto o override', async () => {
  const content = await source('FutureSimulationPanel.jsx');
  assert.match(content, /const \[incomeDraft, setIncomeDraft\] = useState\(''\);/);
  assert.match(content, /const \[expenseDraft, setExpenseDraft\] = useState\(''\);/);
  assert.match(content, /const \[balanceDraft, setBalanceDraft\] = useState\(''\);/);
});

test('textos de ajuda deixam claro que sao deltas (positivo aumenta, negativo reduz, zero nao altera)', async () => {
  const content = await source('FutureSimulationPanel.jsx');
  assert.match(content, /\+1500 para simular R\$ 1\.500 a mais por mês/);
  assert.match(content, /-300 para simular R\$ 300 a menos por mês/);
  assert.match(content, /\+5000 para começar com R\$ 5\.000 a mais/);
  assert.match(content, /Número positivo aumenta, número negativo reduz, zero não altera/);
});

test('nenhuma acao de salvar, persistir ou confirmar existe no painel', async () => {
  const content = await source('FutureSimulationPanel.jsx');
  assert.doesNotMatch(content, /salvar|persist|localStorage|supabase|Salvar|Confirmar/i);
});

// ============================================================================
// Conversão segura de entrada (nunca NaN, nunca parseFloat permissivo)
// ============================================================================

test('painel converte o texto digitado via parseSimulationDeltaInput antes de notificar o pai', async () => {
  const content = await source('FutureSimulationPanel.jsx');
  assert.match(content, /import \{ parseSimulationDeltaInput \} from '\.\/futureSimulationPanelUtils\.js';/);
  assert.match(content, /onChangeOverride\('monthlyIncomeDelta', parseSimulationDeltaInput\(raw\)\)/);
  assert.match(content, /onChangeOverride\('monthlyExpenseDelta', parseSimulationDeltaInput\(raw\)\)/);
  assert.match(content, /onChangeOverride\('initialBalanceDelta', parseSimulationDeltaInput\(raw\)\)/);
  assert.doesNotMatch(content, /parseFloat/);
});

// ============================================================================
// Estado visual: inativo vs ativo
// ============================================================================

test('quando inativo, mostra mensagem de "defina pelo menos um ajuste" e nenhum badge', async () => {
  const content = await source('FutureSimulationPanel.jsx');
  assert.match(content, /Defina pelo menos um ajuste para visualizar a simulação/);
});

test('quando ativo, mostra badge "Modo simulação ativo" e aviso de que os valores sao hipoteticos', async () => {
  const content = await source('FutureSimulationPanel.jsx');
  assert.match(content, /Modo simulação ativo/);
  assert.match(content, /Os valores abaixo são hipotéticos e não alteram seus dados reais\./);
});

test('badge e mensagens usam role="status" e nao dependem apenas de cor', async () => {
  const content = await source('FutureSimulationPanel.jsx');
  const statusOccurrences = content.match(/role="status"/g) ?? [];
  assert.ok(statusOccurrences.length >= 2);
});

test('nao usa variante de erro/alerta vermelho para o indicador de simulacao ativa', async () => {
  const content = await source('FutureSimulationPanel.jsx');
  assert.doesNotMatch(content, /variant="danger"|variant='danger'/);
});

// ============================================================================
// Saída
// ============================================================================

test('botao de saida muda de rotulo conforme o estado (Fechar vs Sair da simulação)', async () => {
  const content = await source('FutureSimulationPanel.jsx');
  assert.match(content, /\{isActive \? 'Sair da simulação' : 'Fechar'\}/);
  assert.match(content, /onClick=\{onExit\}/);
});

// ============================================================================
// Ausência de histórico
// ============================================================================

test('sem historico, campos de entrada e saída ficam desabilitados com motivo explicado em texto', async () => {
  const content = await source('FutureSimulationPanel.jsx');
  assert.match(content, /disabled=\{!hasHistory\}/);
  assert.match(content, /Indisponível sem histórico de entradas e saídas registradas/);
});

test('sem historico, o ajuste de saldo inicial continua habilitado', async () => {
  const content = await source('FutureSimulationPanel.jsx');
  const balanceFieldBlock = content.slice(
    content.indexOf('id="future-simulation-balance-delta"'),
    content.indexOf('/>', content.indexOf('id="future-simulation-balance-delta"')),
  );
  assert.doesNotMatch(balanceFieldBlock, /disabled/);
});

test('aviso explicito quando a projecao base fica limitada pela ausencia de historico', async () => {
  const content = await source('FutureSimulationPanel.jsx');
  assert.match(content, /Sem histórico de transações, a projeção base fica limitada/);
});

// ============================================================================
// Acessibilidade
// ============================================================================

test('cada campo tem label associado via prop label do componente Input (que gera htmlFor)', async () => {
  const content = await source('FutureSimulationPanel.jsx');
  const inputBlocks = content.match(/<Input[\s\S]*?\/>/g) ?? [];
  assert.equal(inputBlocks.length, 3);
  for (const block of inputBlocks) {
    assert.match(block, /label="/);
    assert.match(block, /id="/);
    assert.match(block, /helperText/);
  }
});

// ============================================================================
// Ausência de comportamentos fora do escopo
// ============================================================================

test('nenhuma chamada a Supabase, localStorage, navegacao ou integracao com Dashboard/Uni', async () => {
  const content = await source('FutureSimulationPanel.jsx');
  assert.doesNotMatch(content, /supabase|localStorage|useNavigate|dashboard|uni-chat|uni-llm/i);
});

test('nao instala nem importa nenhuma biblioteca nova (apenas componentes ja existentes do projeto)', async () => {
  const content = await source('FutureSimulationPanel.jsx');
  const importLines = content.match(/^import .+$/gm) ?? [];
  for (const line of importLines) {
    assert.match(line, /from '(react|\.\.?\/)/);
  }
});
