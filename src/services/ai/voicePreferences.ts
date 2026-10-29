export interface VoiceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const VOICE_RATE_STORAGE_KEY = 'perfil360.voice.rate';

export function readVoicePreference(storage: VoiceStorage, key: string): string | null {
  try { return storage.getItem(key); } catch { return null; }
}

export function writeVoicePreference(storage: VoiceStorage, key: string, voiceURI: string): boolean {
  try { storage.setItem(key, voiceURI); return true; } catch { return false; }
}

export function readVoiceRate(storage: VoiceStorage, defaultRate: number): number {
  try {
    const value = Number(storage.getItem(VOICE_RATE_STORAGE_KEY));
    return Number.isFinite(value) && value >= 0.5 && value <= 1.5 ? value : defaultRate;
  } catch {
    return defaultRate;
  }
}

export function writeVoiceRate(storage: VoiceStorage, rate: number): number {
  const clamped = Math.min(1.5, Math.max(0.5, rate));
  try { storage.setItem(VOICE_RATE_STORAGE_KEY, String(clamped)); } catch { /* storage puede estar bloqueado */ }
  return clamped;
}
