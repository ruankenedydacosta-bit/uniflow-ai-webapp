// ETAPA 4: SimplifiedEditProfilePage.jsx é um componente React real (hooks,
// modal, persistência via profileService) -- mesmo padrão já usado no
// projeto para telas sem Testing Library/jsdom instalados: cobertura
// estrutural por leitura de fonte (readFileSync/regex), igual a
// simplifiedAccount.test.js e UniChatPage.test.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// routes.jsx -- editar-perfil usa a tela real, demais subrotas continuam
// placeholders.
// ============================================================================

test('routes.jsx renderiza SimplifiedEditProfilePage na rota de editar perfil', async () => {
  const content = await source('../../app/routes.jsx');
  assert.match(content, /SimplifiedEditProfilePage/);
  assert.match(
    content,
    /ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.EDIT_PROFILE\]\.path[\s\S]{0,200}<SimplifiedEditProfilePage \/>/,
  );
});

test('routes.jsx filtra editar-perfil da lista de placeholders genéricos (sem rota duplicada)', async () => {
  const content = await source('../../app/routes.jsx');
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.EDIT_PROFILE\]\.path/);
});

test('index.js exporta SimplifiedEditProfilePage', async () => {
  const content = await source('./index.js');
  assert.match(content, /export \{ default as SimplifiedEditProfilePage \} from '\.\/SimplifiedEditProfilePage\.jsx';/);
});

// ============================================================================
// Cabeçalho -- voltar + título + Falar com a Uni real (sem chatbot paralelo).
// ============================================================================

test('cabeçalho tem botão voltar para Conta, título e Falar com a Uni real', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /aria-label="Voltar para Conta"/);
  assert.match(content, /navigate\(SIMPLIFIED_ROUTES\.ACCOUNT\)/);
  assert.match(content, /Editar perfil/);
  assert.match(content, /navigate\(SIMPLIFIED_ROUTES\.UNI\)/);
  assert.match(content, /Falar com a Uni/);
});

// ============================================================================
// Foto de perfil -- avatar real, remoção honesta, upload honestamente
// indisponível (sem bucket/infra de storage real).
// ============================================================================

test('avatar usa src/name reais (Avatar já trata fallback de iniciais)', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /<Avatar src=\{profile\?\.avatar_url \|\| undefined\} name=\{fullName \|\| undefined\}/);
});

test('Trocar foto não faz upload real -- mostra aviso honesto, não finge sucesso', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /envio de novas fotos ainda não está disponível/i);
  assert.doesNotMatch(content, /storage\.from/);
});

test('Remover foto abre confirmação e persiste avatar_url: null via profileService', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /setShowRemovePhotoConfirm\(true\)/);
  assert.match(content, /updateProfile\(user\.id, \{ avatar_url: null \}\)/);
  assert.match(content, /disabled=\{!hasAvatar\}/);
});

test('modal de remover foto não usa window.confirm', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.doesNotMatch(content, /window\.confirm/);
});

// ============================================================================
// Campos reais persistidos -- apenas full_name e phone (colunas reais).
// ============================================================================

test('nome completo e telefone são editáveis e persistidos via updateProfile', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /value=\{fullName\}/);
  assert.match(content, /value=\{phone\}/);
  assert.match(content, /updateProfile\(user\.id, \{\s*full_name: fullName,\s*phone,\s*\}\)/);
});

test('e-mail vem de user.email (Auth) e não é um input comum editável', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /const email = user\?\.email/);
  assert.doesNotMatch(content, /type="email"[\s\S]{0,60}onChange/);
});

test('badge Verificado do e-mail só aparece com user.email_confirmed_at real', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /const isEmailVerified = Boolean\(user\?\.email_confirmed_at\)/);
  assert.match(content, /\{isEmailVerified \? \(/);
});

test('telefone não exibe badge Verificado (sem verificação real desse dado)', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  const phoneFieldMatch = content.match(/Telefone[\s\S]{0,400}/);
  assert.ok(phoneFieldMatch);
  assert.doesNotMatch(phoneFieldMatch[0], /Verificado/);
});

// ============================================================================
// Campos sem suporte real no schema -- honestos, não persistidos, não
// fingem sucesso.
// ============================================================================

test('campos sem coluna real (nome preferido, forma de tratamento, nascimento, texto) ficam marcados honestamente', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /Como deseja ser chamado/);
  assert.match(content, /Forma de tratamento/);
  assert.match(content, /Data de nascimento/);
  assert.match(content, /Tamanho do texto/);
  const unavailableCount = (content.match(/Em breve/g) || []).length;
  assert.ok(unavailableCount >= 3, 'deveria marcar múltiplos campos indisponíveis como "Em breve"');
});

test('esses campos honestos não entram no updateProfile (não fabricam persistência)', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  const updateCalls = content.match(/updateProfile\(user\.id, \{[^}]*\}\)/g) || [];
  for (const call of updateCalls) {
    assert.doesNotMatch(call, /preferred_name|salutation|birth_date|language|text_size|address/);
  }
});

test('idioma mostra o único idioma real suportado, sem fingir preferência configurável', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /Português \(Brasil\)/);
});

// ============================================================================
// Endereço e dados de cobrança -- seção expansível, honestamente vazia
// (sem Asaas, sem dados fictícios).
// ============================================================================

test('seção de endereço é expansível e honestamente vazia (sem CEP/rua fictícios)', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /isAddressOpen/);
  assert.match(content, /aria-expanded=\{isAddressOpen\}/);
  assert.match(content, /Nenhum endereço cadastrado ainda/);
  assert.doesNotMatch(content, /01310-100|Av\. Paulista/);
});

// ============================================================================
// Salvar / Cancelar -- dirty-check real, botão desabilitado sem alteração.
// ============================================================================

test('isDirty compara com valores originais reais do profile', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /const originalFullName = cleanText\(profile\?\.full_name\)/);
  assert.match(content, /const originalPhone = cleanText\(profile\?\.phone\)/);
  assert.match(content, /const isDirty = fullName !== originalFullName \|\| phone !== originalPhone/);
});

test('botão Salvar alterações fica desabilitado sem alterações e durante o salvamento', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /disabled=\{!isDirty \|\| isSaving\}/);
  assert.match(content, /loading=\{isSaving\}/);
});

test('salvar mostra sucesso antes de disparar refreshSession (evita perder o feedback no remount do loading global)', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /setSaveSuccess\(true\);\s*refreshSession\(\);/);
});

test('erro ao salvar mostra mensagem simples, não trava a tela', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /Não foi possível salvar agora\. Tente novamente\./);
});

// ============================================================================
// Confirmação de saída com alterações pendentes -- nunca perda silenciosa.
// ============================================================================

test('voltar e cancelar com alterações pendentes pedem confirmação antes de navegar', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /function requestNavigation\(destination\) \{\s*if \(isDirty\) \{/);
  assert.match(content, /function handleBack\(\) \{\s*requestNavigation/);
  assert.match(content, /function handleCancel\(\) \{\s*requestNavigation/);
});

test('modal de descartar alterações não usa window.confirm e oferece continuar editando', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /Descartar alterações\?/);
  assert.match(content, /Continuar editando/);
  assert.doesNotMatch(content, /window\.confirm/);
});

test('fechar aba com alterações pendentes usa beforeunload nativo (não bloqueia sem motivo)', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /beforeunload/);
  assert.match(content, /if \(!isDirty\) return undefined;/);
});

// ============================================================================
// Acessibilidade.
// ============================================================================

test('inputs têm min-height e foco visível definidos no CSS', async () => {
  const css = await source('./simplifiedEditProfile.module.css');
  assert.match(css, /\.input\s*\{[^}]*min-height:\s*52px/);
  assert.match(css, /\.input:focus-visible/);
  assert.match(css, /\.backButton:focus-visible/);
});

test('CSS oferece suporte a prefers-reduced-motion e responsividade', async () => {
  const css = await source('./simplifiedEditProfile.module.css');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /@media \(min-width: 1024px\)/);
});
