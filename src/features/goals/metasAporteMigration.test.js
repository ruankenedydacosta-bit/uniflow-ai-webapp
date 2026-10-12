// #158: conferência estática da migration 064 (aporte e retirada). As regras
// rodaram de verdade em transação desfeita contra o banco (ver o PR); aqui
// fica o que não pode regredir.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const raiz = new URL('../../../', import.meta.url);
const nomeDaMigration = readdirSync(new URL('supabase/migrations/', raiz))
  .find((nome) => /_064_metas_aporte_e_retirada\.sql$/.test(nome));
const migration = nomeDaMigration
  ? readFileSync(new URL(`supabase/migrations/${nomeDaMigration}`, raiz), 'utf8')
  : '';

function corpoDaFuncao(nome) {
  const inicio = migration.indexOf(`create or replace function public.${nome}(`);
  assert.ok(inicio >= 0, `função ${nome} ausente`);
  return migration.slice(inicio, migration.indexOf('$function$;', inicio));
}

test('migration 064 existe com versão de 14 dígitos depois da 063', () => {
  assert.ok(nomeDaMigration, 'migration 064 ausente');
  const versao = nomeDaMigration.split('_')[0];
  assert.match(versao, /^\d{14}$/);
  assert.ok(BigInt(versao) > 20261012005953n);
});

test('retirada grava valor negativo: o check passa a recusar só o zero', () => {
  assert.match(migration, /drop constraint if exists goal_contributions_amount_check;/);
  assert.match(migration, /add constraint goal_contributions_amount_check check \(amount <> 0\);/);
});

test('as funções rodam com a RLS de quem chama e não ficam abertas ao anon', () => {
  for (const nome of ['registrar_movimento_da_meta', 'excluir_movimento_da_meta']) {
    const corpo = corpoDaFuncao(nome);
    assert.match(corpo, /security invoker/);
    assert.match(corpo, /set search_path = ''/);
    assert.match(migration, new RegExp(`revoke all on function public\\.${nome}\\([^)]*\\) from public, anon;`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${nome}\\([^)]*\\) to authenticated;`));
  }
});

test('registrar trava a meta, bloqueia retirada abaixo de zero e meta concluída, e soma o valor guardado', () => {
  const corpo = corpoDaFuncao('registrar_movimento_da_meta');
  assert.match(corpo, /from public\.financial_goals\s+where id = p_goal_id\s+for update;/);
  assert.match(corpo, /v_meta\.status = 'completed'[\s\S]*?meta_concluida/);
  assert.match(corpo, /v_meta\.current_amount \+ v_valor < 0[\s\S]*?retirada_maior_que_guardado/);
  assert.match(corpo, /set current_amount = current_amount \+ v_valor/);
  // A idempotência vem antes de qualquer gravação.
  assert.ok(corpo.indexOf('client_operation_id = p_client_operation_id') < corpo.indexOf('insert into public.transactions'));
});

test('transferência só com conta vinculada; retirada inverte origem e destino', () => {
  const corpo = corpoDaFuncao('registrar_movimento_da_meta');
  assert.match(corpo, /v_meta\.linked_account_id is null[\s\S]*?meta_sem_conta_vinculada/);
  assert.match(corpo, /case when v_valor > 0 then p_conta_id else v_meta\.linked_account_id end,\s+case when v_valor > 0 then v_meta\.linked_account_id else p_conta_id end/);
});

test('excluir desfaz o valor guardado e a transferência lançada junto', () => {
  const corpo = corpoDaFuncao('excluir_movimento_da_meta');
  assert.match(corpo, /v_meta\.status = 'completed'[\s\S]*?meta_concluida/);
  // RLS que barra o DELETE da transferência não pode deixar o aporte sumir sozinho.
  assert.match(corpo, /delete from public\.transactions where id = v_aporte\.transaction_id;\s+if not found then[\s\S]*?transferencia_nao_excluida/);
  assert.match(corpo, /v_meta\.current_amount - v_aporte\.amount < 0[\s\S]*?retirada_maior_que_guardado/);
  assert.match(corpo, /delete from public\.transactions where id = v_aporte\.transaction_id;/);
  assert.match(corpo, /set current_amount = current_amount - v_aporte\.amount/);
});
