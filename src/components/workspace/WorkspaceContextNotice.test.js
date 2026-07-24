import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// UX5 -- aviso curto e dispensável sobre o contexto PF/PJ ativo, reaproveitado
// tanto para a explicação de troca de espaço quanto para o redirecionamento
// de módulo bloqueado. Sem infraestrutura de renderização React neste
// repositório -- cobertura por leitura de código-fonte, mesmo padrão já
// usado no projeto.
// ============================================================================

test('é role="status"/aria-live="polite" (anunciável), nunca um modal bloqueante', async () => {
  const content = await source('WorkspaceContextNotice.jsx');
  assert.match(content, /role="status" aria-live="polite"/);
  assert.doesNotMatch(content, /role="dialog"|aria-modal/);
});

test('sempre dispensável (botão real com onDismiss), independente de ter ação ou não', async () => {
  const content = await source('WorkspaceContextNotice.jsx');
  assert.match(content, /<button type="button" className=\{styles\.dismissButton\} onClick=\{onDismiss\} aria-label="Dispensar aviso">/);
});

test('ação (ex.: "Ir para Espaço Empresa") só renderiza quando actionLabel e onAction estão presentes', async () => {
  const content = await source('WorkspaceContextNotice.jsx');
  assert.match(content, /\{actionLabel && onAction \? \(/);
});

test('não depende de timeout/setTimeout para sumir sozinho -- só é removido via onDismiss/onAction', async () => {
  const content = await source('WorkspaceContextNotice.jsx');
  assert.doesNotMatch(content, /setTimeout/);
});
