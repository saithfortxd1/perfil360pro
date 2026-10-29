export type DetectedVoiceGender = 'female' | 'male' | 'unknown';

function normalizeVoiceText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Web Speech no expone género; solo marcamos género probable si el proveedor lo indica en el nombre/URI. */
export function inferVoiceGender(name: string, voiceURI: string): DetectedVoiceGender {
  const text = normalizeVoiceText(`${name} ${voiceURI}`);
  if (/\b(female|feminine|woman|mujer|femenina)\b/.test(text)) return 'female';
  if (/\b(male|masculine|man|hombre|masculina)\b/.test(text)) return 'male';

  return 'unknown';
}

export interface VoiceCandidate {
  voice: { voiceURI: string };
  name: string;
  lang: string;
  gender: DetectedVoiceGender;
  isSpanish: boolean;
  isLatinSpanish: boolean;
  isSystemVoice: boolean;
}

/** Preferencia guardada primero, después voz española con género masculino probable. */
export function choosePreferredVoice<T extends VoiceCandidate>(voices: readonly T[], savedVoiceURI: string | null): T | null {
  if (savedVoiceURI) {
    const saved = voices.find((voice) => voice.voice.voiceURI === savedVoiceURI);
    return saved ?? null;
  }
  return voices.find((voice) => voice.gender === 'male' && voice.isSpanish)
    ?? voices.find((voice) => voice.isLatinSpanish)
    ?? voices.find((voice) => voice.isSpanish)
    ?? voices[0]
    ?? null;
}
