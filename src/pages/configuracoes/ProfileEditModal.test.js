import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// --- Estrutura e inicializacao ----------------------------------------------

test('estado inicial usa createProfileEditForm(profile, user) -- inicializacao por funcao', async () => {
  const content = await source('ProfileEditModal.jsx');
  assert.match(
    content,
    /const \[form, setForm\] = useState\(\(\) => createProfileEditForm\(profile, user\)\);/,
  );
});

test('titulo e descricao do modal sao fixos e nao mencionam senha/e-mail/avatar', async () => {
  const content = await source('ProfileEditModal.jsx');
  assert.match(content, /title="Editar perfil"/);
  assert.match(content, /description="Atualize seu nome e telefone de contato\."/);
});

test('campos existem: nome completo, e-mail (somente leitura) e telefone', async () => {
  const content = await source('ProfileEditModal.jsx');
  for (const id of ['profile-form-full-name', 'profile-form-email', 'profile-form-phone']) {
    assert.match(content, new RegExp(`id="${id}"`));
  }
});

test('campo de e-mail e somente leitura (disabled), preenchido com user.email, nunca enviado no payload', async () => {
  const content = await source('ProfileEditModal.jsx');
  const emailBlock = content.slice(content.indexOf('id="profile-form-email"'), content.indexOf('id="profile-form-phone"'));
  assert.match(emailBlock, /value=\{user\?\.email \?\? ''\}/);
  assert.match(emailBlock, /disabled/);
});

test('nao existe campo editavel de avatar_url nesta fase (somente leitura, sem infraestrutura de upload)', async () => {
  const content = await source('ProfileEditModal.jsx');
  assert.doesNotMatch(content, /avatar_url/);
  assert.doesNotMatch(content, /type="file"|Storage|upload/i);
});

// --- Validacao --------------------------------------------------------------

test('submit roda validateProfileForm antes de qualquer chamada ao service', async () => {
  const content = await source('ProfileEditModal.jsx');
  const fnBody = content.slice(content.indexOf('async function handleSubmit'), content.indexOf('return (\n    <Modal'));
  assert.match(fnBody, /const validationMessage = validateProfileForm\(form\);/);
  assert.match(fnBody, /if \(validationMessage\) \{\s*\n\s*setValidationError\(validationMessage\);\s*\n\s*return;/);
});

// --- Persistencia -------------------------------------------------------------

test('submit chama profileService.updateProfile com user.id e o payload construido por buildProfileUpdatePayload -- nunca chama Supabase diretamente', async () => {
  const content = await source('ProfileEditModal.jsx');
  assert.match(content, /import \{ updateProfile \} from '\.\.\/\.\.\/services\/profileService\.js';/);
  assert.match(content, /const payload = buildProfileUpdatePayload\(form\);/);
  assert.match(content, /const result = await updateProfile\(user\?\.id, payload\);/);
  assert.doesNotMatch(content, /supabase\.|createClient\(/i);
});

test('sucesso chama onSaved(result.data) e fecha o modal somente depois disso -- erro nao fecha o modal', async () => {
  const content = await source('ProfileEditModal.jsx');
  const fnBody = content.slice(content.indexOf('async function handleSubmit'), content.indexOf('} finally {'));
  assert.match(fnBody, /if \(result\.error\) \{\s*\n\s*setSaveError\(result\.error\);\s*\n\s*return;\s*\n\s*\}/);
  assert.match(fnBody, /await onSaved\?\.\(result\.data\);\s*\n\s*onClose\(\);/);
});

test('duplo submit e bloqueado por trava sincrona (mutationRef), mesmo padrao ja usado no projeto', async () => {
  const content = await source('ProfileEditModal.jsx');
  assert.match(content, /const mutationRef = useRef\(false\);/);
  assert.match(content, /if \(mutationRef\.current\) return;/);
  assert.match(content, /mutationRef\.current = true;/);
  assert.match(content, /mutationRef\.current = false;/);
});

test('erro do service e exibido via getProfileErrorMessage, nunca a mensagem crua do Supabase', async () => {
  const content = await source('ProfileEditModal.jsx');
  assert.match(content, /getProfileErrorMessage\(saveError, 'Não foi possível salvar o perfil\. Tente novamente\.'\)/);
});

// --- Fechamento --------------------------------------------------------------

test('fechar (overlay/ESC/Cancelar) e bloqueado durante isSaving', async () => {
  const content = await source('ProfileEditModal.jsx');
  assert.match(content, /function handleClose\(\) \{\s*\n\s*if \(isSaving\) return;\s*\n\s*onClose\(\);\s*\n\s*\}/);
  assert.match(content, /closeOnOverlayClick=\{!isSaving\}/);
  assert.match(content, /closeOnEsc=\{!isSaving\}/);
});

test('cancelar nunca chama updateProfile -- so onClose', async () => {
  const content = await source('ProfileEditModal.jsx');
  const footerBlock = content.slice(content.indexOf('footer={'), content.indexOf('<form'));
  assert.match(footerBlock, /onClick=\{handleClose\}/);
  assert.doesNotMatch(footerBlock, /updateProfile/);
});

test('botao salvar usa loading={isSaving} (mesmo padrao de feedback visual do Button compartilhado)', async () => {
  const content = await source('ProfileEditModal.jsx');
  assert.match(content, /<Button type="submit" loading=\{isSaving\}>/);
});
