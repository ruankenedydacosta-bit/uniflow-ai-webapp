import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// Sem infraestrutura de renderização React neste repositório para páginas
// -- cobertura por leitura de código-fonte para wiring/garantias
// estruturais, mesmo padrão já usado em todo o projeto.

// ============================================================================
// CFG3 -- perfil real, sem dado de identidade fictício
// ============================================================================

test('SettingsPage obtem profile/user/isLoading/isSupabaseConfigured/refreshSession de useSession()', async () => {
  const page = await source('SettingsPage.jsx');
  assert.match(page, /import \{ useSession \} from '\.\.\/app\/SessionContext\.jsx';/);
  assert.match(
    page,
    /const \{ isLoading, isSupabaseConfigured, profile, refreshSession, user \} = useSession\(\);/,
  );
});

test('nome exibido usa getProfileDisplayName(profile, user) -- nunca settingsMock.profile', async () => {
  const page = await source('SettingsPage.jsx');
  assert.match(page, /import \{ getProfileDisplayName \} from '\.\/configuracoes\/profileFormUtils\.js';/);
  assert.match(page, /const profileDisplayName = getProfileDisplayName\(profile, user\);/);
  assert.doesNotMatch(page, /settingsMock\.profile/);
});

test('nunca renderiza o nome fictício "UniFlow Demo" nem o e-mail hardcoded do mock', async () => {
  const page = await source('SettingsPage.jsx');
  assert.doesNotMatch(page, /UniFlow Demo/);
  assert.doesNotMatch(page, /uniflow\.ai\.acesso@gmail\.com/);
});

test('e-mail exibido vem de user.email real, com fallback textual explícito quando ausente', async () => {
  const page = await source('SettingsPage.jsx');
  assert.match(page, /const profileEmail = user\?\.email \?\? '';/);
  assert.match(page, /\{profileEmail \|\| 'E-mail não disponível'\}/);
});

test('telefone exibido vem de profile.phone real, com indicacao clara quando ausente', async () => {
  const page = await source('SettingsPage.jsx');
  assert.match(page, /const profilePhone = profile\?\.phone;/);
  assert.match(page, /\{profilePhone \|\| 'Não informado'\}/);
});

test('Avatar recebe profile.avatar_url real e o nome real como fallback de iniciais', async () => {
  const page = await source('SettingsPage.jsx');
  assert.match(page, /<Avatar name=\{profileDisplayName\} src=\{profile\?\.avatar_url\} size="lg" status="online" \/>/);
});

// --- Edicao -------------------------------------------------------------------

test('botao "Editar perfil" abre o modal real (nao decorativo) -- disabled quando nao ha usuario editavel', async () => {
  const page = await source('SettingsPage.jsx');
  assert.match(
    page,
    /<Button disabled=\{!canEditProfile\} title=\{getEditProfileTitle\(\)\} onClick=\{handleOpenEditProfile\}>\s*\n\s*Editar perfil\s*\n\s*<\/Button>/,
  );
});

test('canEditProfile exige usuario autenticado real e nao estar carregando (modo demo fica desabilitado)', async () => {
  const page = await source('SettingsPage.jsx');
  assert.match(page, /const canEditProfile = Boolean\(user\?\.id\) && !isLoading;/);
});

test('ProfileEditModal e renderizado somente quando isEditingProfile, com profile/user/onClose/onSaved reais', async () => {
  const page = await source('SettingsPage.jsx');
  assert.match(page, /import ProfileEditModal from '\.\/configuracoes\/ProfileEditModal\.jsx';/);
  assert.match(page, /\{isEditingProfile \? \(\s*\n\s*<ProfileEditModal/);
  assert.match(page, /profile=\{profile\}/);
  assert.match(page, /user=\{user\}/);
  assert.match(page, /onClose=\{handleCloseEditProfile\}/);
  assert.match(page, /onSaved=\{handleProfileSaved\}/);
});

test('handleProfileSaved chama refreshSession() para sincronizar o restante do app com o perfil atualizado', async () => {
  const page = await source('SettingsPage.jsx');
  const fnBody = page.slice(page.indexOf('async function handleProfileSaved'), page.indexOf('return (\n    <div'));
  assert.match(fnBody, /await refreshSession\(\);/);
  assert.match(fnBody, /setProfileJustSaved\(true\);/);
});

test('mensagem de sucesso ("Perfil atualizado.") e condicional a profileJustSaved, usa role="status"', async () => {
  const page = await source('SettingsPage.jsx');
  assert.match(page, /\{profileJustSaved \? \(\s*\n\s*<p role="status" className="uf-text-caption">Perfil atualizado\.<\/p>/);
});

test('abrir a edicao novamente limpa a mensagem de sucesso anterior', async () => {
  const page = await source('SettingsPage.jsx');
  const fnBody = page.slice(page.indexOf('function handleOpenEditProfile'), page.indexOf('function handleCloseEditProfile'));
  assert.match(fnBody, /setProfileJustSaved\(false\);/);
});

// ============================================================================
// Regressão -- demais seções e comportamento preexistente preservados
// ============================================================================

test('modo de uso e plano atual continuam derivados de access real (nao mock)', async () => {
  const page = await source('SettingsPage.jsx');
  assert.match(page, /const currentModeLabel = USER_MODE_LABELS\[access\.userMode\];/);
  assert.match(page, /const currentPlanLabel = PLAN_LABELS\[access\.plan\];/);
});

test('tema (ThemeSelector) continua renderizado sem alteracao', async () => {
  const page = await source('SettingsPage.jsx');
  assert.match(page, /import \{ ThemeSelector \} from '\.\.\/features\/theme';/);
  assert.match(page, /<ThemeSelector \/>/);
});

test('demais secoes mock (preferencias da Uni, voz, notificacoes, privacidade, espacos, leitura da Uni) permanecem intactas', async () => {
  const page = await source('SettingsPage.jsx');
  assert.match(page, /settingsMock\.usageModes/);
  assert.match(page, /settingsMock\.uniPreferences/);
  assert.match(page, /settingsMock\.voiceInteraction/);
  assert.match(page, /settingsMock\.notifications/);
  assert.match(page, /settingsMock\.privacy/);
  assert.match(page, /settingsMock\.spaces/);
  assert.match(page, /settings\.uniReading/);
});

test('logout (CFG2) nao e mencionado nem alterado nesta pagina -- fora do escopo da CFG3', async () => {
  const page = await source('SettingsPage.jsx');
  assert.doesNotMatch(page, /signOut/);
});

test('nenhuma migration/service novo de empresa, equipe, convites, permissoes ou billing foi introduzido', async () => {
  const page = await source('SettingsPage.jsx');
  assert.doesNotMatch(page, /workspace_members|invit|billing|subscription\./i);
});
