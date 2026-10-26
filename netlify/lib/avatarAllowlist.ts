export type AvatarConfigErrorCode = 'config-missing' | 'config-invalid' | 'invalid-avatar' | 'avatar-not-allowed';

export type AvatarResolution =
  | { ok: true; avatarId: string }
  | { ok: false; code: AvatarConfigErrorCode; message: string };

type AllowedAvatarParse =
  | { ok: true; avatarIds: string[] }
  | { ok: false; code: 'config-missing' | 'config-invalid'; message: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeAvatarId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/^["']|["']$/g, '').trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

export function parseAllowedAvatarIds(raw: string | undefined): AllowedAvatarParse {
  if (!raw?.trim()) {
    return {
      ok: false,
      code: 'config-missing',
      message: 'La configuración del servidor no incluye avatares permitidos.',
    };
  }

  const entries = raw.split(',');
  const avatarIds: string[] = [];
  for (const entry of entries) {
    const candidate = normalizeAvatarId(entry);
    if (!candidate) {
      return {
        ok: false,
        code: 'config-invalid',
        message: 'La lista de avatares permitidos tiene un formato inválido.',
      };
    }
    if (!avatarIds.includes(candidate)) avatarIds.push(candidate);
  }

  return { ok: true, avatarIds };
}

export function resolveAvatarFromAllowlist(
  requestedAvatarId: unknown,
  rawAllowedAvatarIds: string | undefined,
): AvatarResolution {
  const parsed = parseAllowedAvatarIds(rawAllowedAvatarIds);
  if (!parsed.ok) return parsed;

  const avatarId = normalizeAvatarId(requestedAvatarId);
  if (!avatarId) {
    return {
      ok: false,
      code: 'invalid-avatar',
      message: 'El identificador del avatar seleccionado no es válido.',
    };
  }
  if (!parsed.avatarIds.includes(avatarId)) {
    return {
      ok: false,
      code: 'avatar-not-allowed',
      message: 'Este avatar no está habilitado en la configuración del servidor.',
    };
  }
  return { ok: true, avatarId };
}
