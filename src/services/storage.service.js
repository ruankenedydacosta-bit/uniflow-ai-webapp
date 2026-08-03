import { isSupabaseConfigured, supabase } from './supabaseClient.js';

export const PROFILE_AVATAR_BUCKET = 'profile-avatars';
export const PROFILE_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_AVATAR_SIGNED_URL_TTL = 60 * 60;
export const PROFILE_AVATAR_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const EXTENSION_BY_MIME = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});

function result(data, error = null) {
  return { data, error, isConfigured: isSupabaseConfigured };
}

function unavailable() {
  return result(null, {
    code: 'SUPABASE_NOT_CONFIGURED',
    message: 'O armazenamento ainda não está disponível.',
  });
}

export function validateProfileAvatarFile(file) {
  if (!file) return 'Selecione uma imagem.';
  if (!PROFILE_AVATAR_MIME_TYPES.includes(file.type)) return 'Use uma imagem JPEG, PNG ou WebP.';
  if (!Number.isFinite(file.size) || file.size <= 0) return 'O arquivo selecionado está vazio.';
  if (file.size > PROFILE_AVATAR_MAX_BYTES) return 'A imagem deve ter no máximo 5 MB.';
  return null;
}

function createObjectName(userId, mimeType) {
  const uniqueId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${userId}/${uniqueId}.${EXTENSION_BY_MIME[mimeType]}`;
}

export async function createProfileAvatarSignedUrl(path) {
  if (!path) return result(null);
  if (!supabase) return unavailable();

  const { data, error } = await supabase.storage
    .from(PROFILE_AVATAR_BUCKET)
    .createSignedUrl(path, PROFILE_AVATAR_SIGNED_URL_TTL);

  return result(data?.signedUrl ?? null, error);
}

export async function uploadProfileAvatar(userId, file) {
  if (!supabase) return unavailable();
  if (!userId) return result(null, { code: 'USER_REQUIRED', message: 'Usuário autenticado ausente.' });

  const validationError = validateProfileAvatarFile(file);
  if (validationError) return result(null, { code: 'INVALID_AVATAR_FILE', message: validationError });

  const path = createObjectName(userId, file.type);
  const uploadResult = await supabase.storage
    .from(PROFILE_AVATAR_BUCKET)
    .upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false });

  if (uploadResult.error) return result(null, uploadResult.error);

  const signedUrlResult = await createProfileAvatarSignedUrl(path);
  if (signedUrlResult.error) {
    await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([path]);
    return result(null, signedUrlResult.error);
  }

  return result({ path, signedUrl: signedUrlResult.data });
}

export async function removeProfileAvatar(path, userId) {
  if (!path) return result(true);
  if (!supabase) return unavailable();
  if (!userId || !path.startsWith(`${userId}/`)) {
    return result(null, { code: 'AVATAR_PATH_FORBIDDEN', message: 'Imagem de perfil inválida.' });
  }

  const { error } = await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([path]);
  return result(!error, error);
}
