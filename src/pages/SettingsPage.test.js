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
// CFG4 -- saneamento dos blocos mock (nenhum dado fictício apresentado como real)
// ============================================================================

test('nunca renderiza o workspace fictício "Empresa demo"', async () => {
  const page = await source('SettingsPage.jsx');
  assert.doesNotMatch(page, /Empresa demo/);
});

test('nunca renderiza o texto desatualizado "Futuro Supabase Auth com RLS"', async () => {
  const page = await source('SettingsPage.jsx');
  const mock = await source('configuracoes/settings.mock.js');
  assert.doesNotMatch(page, /Futuro Supabase Auth com RLS/);
  assert.doesNotMatch(mock, /Futuro Supabase Auth com RLS/);
});

test('Preferências da Uni, Voz e interação e Notificações usam ComingSoonSection ("Em breve"), nunca uma lista como se estivesse configurada', async () => {
  const page = await source('SettingsPage.jsx');
  assert.match(page, /import ComingSoonSection from '\.\/configuracoes\/ComingSoonSection\.jsx';/);
  assert.match(page, /<ComingSoonSection\s*\n\s*title="Preferências da Uni"/);
  assert.match(page, /<ComingSoonSection\s*\n\s*title="Voz e interação"/);
  assert.match(page, /<ComingSoonSection\s*\n\s*title="Notificações"/);
  assert.doesNotMatch(page, /settingsMock\.uniPreferences|settingsMock\.voiceInteraction|settingsMock\.notifications/);
});

test('nenhum badge "Ativo" fictício para voz ou preferências inexistentes (o unico "Ativo" real e o de Modo de uso, vindo de access.userMode)', async () => {
  const page = await source('SettingsPage.jsx');
  const ativoOccurrences = page.match(/>\s*Ativo\s*</g) ?? [];
  assert.equal(ativoOccurrences.length, 1);
  assert.match(page, /\{isActive \? \(\s*\n\s*<Badge variant="success" size="sm" dot>\s*\n\s*Ativo/);
});

test('Leitura da Uni nao apresenta mais analise fictícia -- mostra "Em breve"', async () => {
  const page = await source('SettingsPage.jsx');
  assert.doesNotMatch(page, /settings\.uniReading/);
  const uniCardBlock = page.slice(page.indexOf('<h3>Leitura da Uni</h3>'), page.indexOf('</Card>', page.indexOf('<h3>Leitura da Uni</h3>')));
  assert.match(uniCardBlock, /Em breve/);
});

test('Espaços mostra somente o espaço atual (derivado de access real), nunca uma lista de workspaces inventados', async () => {
  const page = await source('SettingsPage.jsx');
  assert.doesNotMatch(page, /settingsMock\.spaces/);
  assert.match(
    page,
    /<Badge variant=\{access\.currentWorkspace === WORKSPACE_TYPES\.BUSINESS \? 'primary' : 'secondary'\} size="sm">\s*\n\s*\{settings\.workspaceLabel\}/,
  );
});

test('botão "Perguntar à Uni" fica desabilitado com title explicativo, mesmo padrão de outros módulos (Clientes/Agenda/Projetos/Relatórios)', async () => {
  const page = await source('SettingsPage.jsx');
  assert.match(page, /<Button variant="secondary" disabled title="Disponível em breve\.">\s*\n\s*Perguntar à Uni/);
});

test('settings.mock.js nao exporta mais profile, uniPreferences, voiceInteraction, notifications ou spaces (orfaos removidos)', async () => {
  const mock = await source('configuracoes/settings.mock.js');
  for (const removedKey of ['profile:', 'uniPreferences:', 'voiceInteraction:', 'notifications:', 'spaces:']) {
    assert.doesNotMatch(mock, new RegExp(removedKey.replace(':', '\\s*:')));
  }
});

test('settings.mock.js continua exportando somente o que ainda e usado (usageModes, privacy, personal/business.workspaceLabel)', async () => {
  const mock = await source('configuracoes/settings.mock.js');
  assert.match(mock, /usageModes:/);
  assert.match(mock, /privacy:/);
  assert.match(mock, /personal:\s*\{\s*\n\s*workspaceLabel: 'Pessoal',/);
  assert.match(mock, /business:\s*\{\s*\n\s*workspaceLabel: 'Empresarial',/);
});

test('nenhum <a href="#"> nem div clicavel foi introduzido para os blocos futuros', async () => {
  const page = await source('SettingsPage.jsx');
  const comingSoon = await source('configuracoes/ComingSoonSection.jsx');
  assert.doesNotMatch(page, /href="#"/);
  assert.doesNotMatch(comingSoon, /href="#"|onClick/);
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

test('secoes reais preservadas (modo de uso, privacidade real) continuam usando settingsMock', async () => {
  const page = await source('SettingsPage.jsx');
  assert.match(page, /settingsMock\.usageModes/);
  assert.match(page, /settingsMock\.privacy/);
});

test('logout (CFG2) nao e mencionado nem alterado nesta pagina -- fora do escopo da CFG3', async () => {
  const page = await source('SettingsPage.jsx');
  assert.doesNotMatch(page, /signOut/);
});

test('nenhuma migration/service novo de empresa, equipe, convites, permissoes ou billing foi introduzido', async () => {
  const page = await source('SettingsPage.jsx');
  assert.doesNotMatch(page, /workspace_members|invit|billing|subscription\./i);
});
