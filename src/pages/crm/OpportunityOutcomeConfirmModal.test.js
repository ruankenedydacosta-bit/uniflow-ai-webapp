import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('./', import.meta.url);
const source = (path) => readFile(new URL(path, ROOT), 'utf8');

test('16. as tres opcoes de encerramento existem (ganha, perdida, cancelada)', async () => {
  const contents = await source('OpportunityOutcomeConfirmModal.jsx');
  assert.match(contents, /Marcar como ganha/);
  assert.match(contents, /Marcar como perdida/);
  assert.match(contents, /Cancelar oportunidade/);
});

test('18. a escolha de um outcome dentro do modal e a propria confirmacao (sem segunda camada de "tem certeza")', async () => {
  const contents = await source('OpportunityOutcomeConfirmModal.jsx');
  assert.match(contents, /onClick=\{\(\) => handleChooseOutcome\('won'\)\}/);
  assert.match(contents, /onClick=\{\(\) => handleChooseOutcome\('lost'\)\}/);
  assert.match(contents, /onClick=\{\(\) => handleChooseOutcome\('cancelled'\)\}/);
  assert.doesNotMatch(contents, /window\.confirm/);
});

test('24/25. handleChooseOutcome chama pipeline.setOpportunityOutcome enviando somente o outcome escolhido', async () => {
  const contents = await source('OpportunityOutcomeConfirmModal.jsx');
  assert.match(
    contents,
    /const result = await pipeline\.setOpportunityOutcome\(opportunity\.id, outcome\);/,
  );
});

test('21. handler bloqueia execucao duplicada durante mutation (guarda isMutating)', async () => {
  const contents = await source('OpportunityOutcomeConfirmModal.jsx');
  assert.match(
    contents,
    /async function handleChooseOutcome\(outcome\) \{\s*\n\s*if \(isMutating\) return;/,
  );
});

test('sucesso (result sem error) chama onClose', async () => {
  const contents = await source('OpportunityOutcomeConfirmModal.jsx');
  assert.match(
    contents,
    /if \(result && !result\.error\) \{\s*\n\s*onClose\(\);\s*\n\s*return;\s*\n\s*\}/,
  );
});

test('27/28. erro mantem o modal aberto (nao chama onClose) e usa mensagem segura via getOpportunityErrorMessage', async () => {
  const contents = await source('OpportunityOutcomeConfirmModal.jsx');
  assert.match(contents, /getOpportunityErrorMessage\(/);
  assert.match(
    contents,
    /'Não foi possível encerrar a oportunidade\. Tente novamente\.'/,
  );
});

test('erro fica em estado local outcomeError, nunca lendo pipeline.error diretamente', async () => {
  const contents = await source('OpportunityOutcomeConfirmModal.jsx');
  assert.match(contents, /const \[outcomeError, setOutcomeError\] = useState\(null\);/);
  assert.match(contents, /<FormMessage>\{outcomeError\}<\/FormMessage>/);
  assert.doesNotMatch(contents, /pipeline\.error/);
});

test('limpa outcomeError antes de cada nova tentativa', async () => {
  const contents = await source('OpportunityOutcomeConfirmModal.jsx');
  assert.match(
    contents,
    /async function handleChooseOutcome\(outcome\) \{\s*\n\s*if \(isMutating\) return;\s*\n\s*setOutcomeError\(null\);/,
  );
});

test('bloqueia fechamento, ESC e overlay durante mutation', async () => {
  const contents = await source('OpportunityOutcomeConfirmModal.jsx');
  assert.match(contents, /function handleClose\(\) \{\s*\n\s*if \(isMutating\) return;/);
  assert.match(contents, /closeOnOverlayClick=\{!isMutating\}/);
  assert.match(contents, /closeOnEsc=\{!isMutating\}/);
});

test('botao Cancelar e os tres botoes de outcome ficam desabilitados/loading durante mutation', async () => {
  const contents = await source('OpportunityOutcomeConfirmModal.jsx');
  const disabledCount = (contents.match(/disabled=\{isMutating\}/g) ?? []).length;
  const loadingCount = (contents.match(/loading=\{isMutating\}/g) ?? []).length;
  assert.equal(disabledCount, 4); // Cancelar + 3 opcoes de outcome
  assert.equal(loadingCount, 3); // as 3 opcoes de outcome (Cancelar nao usa loading)
});

test('29/30. nao existe opcao para reabrir (voltar a open) nem para transicionar entre outcomes encerrados', async () => {
  const contents = await source('OpportunityOutcomeConfirmModal.jsx');
  assert.doesNotMatch(contents, /handleChooseOutcome\('open'\)/);
  assert.doesNotMatch(contents, /Reabrir/i);
});

test('31/32. nao chama refresh nem altera pipeline.opportunities manualmente -- so usa o registro retornado', async () => {
  const contents = await source('OpportunityOutcomeConfirmModal.jsx');
  assert.doesNotMatch(contents, /\.refresh\(\)/);
  assert.doesNotMatch(contents, /setOpportunities/);
  assert.doesNotMatch(contents, /window\.location|location\.reload/);
});

test('nao instala nem importa biblioteca de menu/confirmacao externa', async () => {
  const contents = await source('OpportunityOutcomeConfirmModal.jsx');
  const importLines = contents.split('\n').filter((line) => line.trim().startsWith('import'));
  for (const line of importLines) {
    assert.match(line, /^import .* from '(\.\.?\/|react)/);
  }
});
