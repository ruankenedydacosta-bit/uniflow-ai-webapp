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

// Fase 3 do redesign (#90): a tela é a aba Perfil de "Configurações"
// (tela 14), com as abas navegando entre as rotas já existentes. O botão
// Falar com a Uni mora no card da Uni ao fim da página.
test('cabeçalho Configurações com voltar para o Mais, aba Perfil ativa e Falar com a Uni real no card da Uni', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /backLabel="Voltar para Mais"/);
  assert.match(content, /navigate\(SIMPLIFIED_ROUTES\.ACCOUNT\)/);
  assert.match(content, /title="Configurações"/);
  assert.match(content, /active=\{ACCOUNT_SUBROUTE_IDS\.EDIT_PROFILE\}/);
  assert.match(content, /onBeforeNavigate=\{requestNavigation\}/);
  assert.match(content, /navigate\(SIMPLIFIED_ROUTES\.UNI\)/);
  assert.match(content, /Falar com a Uni/);
});

// ============================================================================
// Foto de perfil -- preview e storage privado, sempre confirmado no salvar.
// ============================================================================

test('avatar usa src/name reais (Avatar já trata fallback de iniciais)', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /<Avatar src=\{displayedAvatar\} name=\{form\.full_name \|\| undefined\} size="lg"/);
});

test('Trocar foto valida, cria preview e envia somente no salvamento explícito', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /validateProfileAvatarFile\(file\)/);
  assert.match(content, /URL\.createObjectURL\(file\)/);
  assert.match(content, /uploadProfileAvatar\(user\.id, selectedAvatarFile\)/);
});

test('Remover foto abre confirmação e só persiste a remoção no salvamento', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /setShowRemovePhotoConfirm\(true\)/);
  assert.match(content, /setAvatarRemovalRequested\(true\)/);
  assert.match(content, /payload\.avatar_path = uploadedAvatarPath/);
  assert.match(content, /payload\.avatar_url = null/);
  assert.match(content, /disabled=\{!hasAvatar\}/);
});

test('modal de remover foto não usa window.confirm', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.doesNotMatch(content, /window\.confirm/);
});

// ============================================================================
// Campos reais persistidos via contrato fechado e SessionContext.
// ============================================================================

test('nome completo e telefone são editáveis e persistidos via updateProfile', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /value=\{form\.full_name\}/);
  assert.match(content, /value=\{form\.phone\}/);
  assert.match(content, /buildSimplifiedProfilePayload\(form\)/);
  assert.match(content, /updateOwnProfile\(payload\)/);
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
// Preferências funcionais, sem inferência ou suporte multilíngue fictício.
// ============================================================================

test('nome preferido, tratamento, nascimento e texto são controles editáveis reais', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /Como deseja ser chamado/);
  assert.match(content, /Forma de tratamento/);
  assert.match(content, /Data de nascimento/);
  assert.match(content, /Tamanho do texto/);
  assert.match(content, /value=\{form\.preferred_name\}/);
  assert.match(content, /TREATMENT_OPTIONS\.map/);
  assert.match(content, /type="date"/);
  assert.match(content, /TEXT_SIZE_OPTIONS\.map/);
  assert.doesNotMatch(content, />Em breve</);
});

test('payload centralizado inclui somente preferências oficiais', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  const utility = await source('./simplifiedProfilePreferences.js');
  assert.match(content, /buildSimplifiedProfilePayload\(form\)/);
  assert.match(utility, /preferred_name:/);
  assert.match(utility, /treatment_preference:/);
  assert.match(utility, /birth_date:/);
  assert.match(utility, /locale:/);
  assert.match(utility, /text_size:/);
  assert.doesNotMatch(utility, /address:/);
});

test('idioma oferece apenas Português Brasil enquanto não há tradução real', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  const utility = await source('./simplifiedProfilePreferences.js');
  assert.match(content, /LOCALE_OPTIONS\.map/);
  assert.match(utility, /value: 'pt-BR', label: 'Português \(Brasil\)'/);
});

// ============================================================================
// Endereço e dados de cobrança -- seção expansível, honestamente vazia
// (sem Asaas, sem dados fictícios).
// ============================================================================

test('seção de endereço é expansível e honestamente vazia (sem CEP/rua fictícios)', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /isAddressOpen/);
  assert.match(content, /aria-expanded=\{isAddressOpen\}/);
  assert.match(content, /não possuem uma estrutura segura definida/);
  assert.doesNotMatch(content, /01310-100|Av\. Paulista/);
});

// ============================================================================
// Salvar / Cancelar -- dirty-check real, botão desabilitado sem alteração.
// ============================================================================

test('isDirty compara o payload normalizado e alterações de foto', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /serializeSimplifiedProfileForm\(form\) !== serializeSimplifiedProfileForm\(savedForm\)/);
  assert.match(content, /const photoDirty = Boolean\(selectedAvatarFile \|\| avatarRemovalRequested\)/);
});

test('botão Salvar alterações fica desabilitado sem alterações e durante o salvamento', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /disabled=\{!isDirty \|\| isSaving\}/);
  assert.match(content, /loading=\{isSaving\}/);
});

test('salvar atualiza o perfil pela sessão sem reload global', async () => {
  const content = await source('./SimplifiedEditProfilePage.jsx');
  assert.match(content, /const result = await updateOwnProfile\(payload\)/);
  assert.match(content, /setSaveSuccess\(true\)/);
  assert.doesNotMatch(content, /refreshSession\(\)/);
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

// Fase 3 do redesign (#90): campo de 44px (handoff) e o botão voltar vive
// no cabeçalho compartilhado das subpáginas.
test('inputs têm min-height de 44px e foco visível definidos no CSS', async () => {
  const css = await source('./simplifiedEditProfile.module.css');
  assert.match(css, /\.input\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.input:focus-visible/);
  const header = await source('./simplifiedSubpageHeader.module.css');
  assert.match(header, /\.backButton:focus-visible/);
});

test('CSS oferece suporte a prefers-reduced-motion e responsividade', async () => {
  const css = await source('./simplifiedEditProfile.module.css');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /@media \(min-width: 1024px\)/);
});
