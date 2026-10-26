/**
 * Utilidades de audio PCM para el avatar de LiveAvatar (HeyGen).
 *
 * FORMATO EXIGIDO POR LIVEAVATAR (verificado en el SDK instalado, v0.0.19):
 *   - PCM **16-bit con signo, little-endian**
 *   - **24 000 Hz**
 *   - **mono**
 *   - codificado en **Base64**
 *
 * El método `LiveAvatarSession.repeatAudio(audio)` recibe la pista COMPLETA ya en
 * Base64 y el propio SDK la fragmenta (primer trozo de 400 ms, resto de 1 s) antes
 * de enviarla por WebSocket como `agent.speak` + `agent.speak_end`.
 *
 * IMPORTANTE: en modo LITE, `message()` y `repeat()` lanzan
 * "Not permitted in LITE mode". La ÚNICA vía de voz es `repeatAudio()`.
 *
 * Este módulo es puro: no hace red, no usa claves y se puede verificar con audio sintético.
 */

export const PCM_SAMPLE_RATE = 24_000;
export const PCM_BITS_PER_SAMPLE = 16;
export const PCM_CHANNELS = 1;
export const PCM_BYTES_PER_SAMPLE = PCM_BITS_PER_SAMPLE / 8; // 2

/** Tamaños de fragmento que usa el SDK (en CARACTERES de la cadena Base64). */
export const FIRST_CHUNK_CHARS = 19_200; // 400 ms de PCM crudo
export const SUBSEQUENT_CHUNK_CHARS = 48_000; // 1 s de PCM crudo

export interface PcmValidation {
  ok: boolean;
  reason?: string;
  bytes?: number;
  durationMs?: number;
}

/** Convierte muestras Float32 en [-1, 1] a PCM 16-bit con signo. */
export function floatToPcm16(samples: Float32Array): Int16Array {
  const output = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    output[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return output;
}

/** Serializa Int16Array a bytes little-endian. */
export function pcm16ToBytes(pcm: Int16Array): Uint8Array {
  const bytes = new Uint8Array(pcm.length * PCM_BYTES_PER_SAMPLE);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < pcm.length; i += 1) {
    view.setInt16(i * PCM_BYTES_PER_SAMPLE, pcm[i] ?? 0, /* littleEndian */ true);
  }
  return bytes;
}

/** Codifica bytes a Base64 sin desbordar la pila (btoa portable). */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x4000; // 16 384 bytes por iteración
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  // `btoa` existe en navegadores y en Node >= 16.
  return btoa(binary);
}

/** Decodifica Base64 a bytes. */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** AudioBuffer del Web Audio API → Base64 PCM 16-bit 24 kHz mono. */
export function audioBufferToPcm24kBase64(buffer: AudioBuffer): string {
  if (buffer.sampleRate !== PCM_SAMPLE_RATE) {
    throw new Error(`Se esperaba ${PCM_SAMPLE_RATE} Hz y se recibió ${buffer.sampleRate} Hz.`);
  }
  // Mono: si el buffer es estéreo, se toma el canal 0 (no se mezcla aquí para no alterar el tono).
  const channel = buffer.getChannelData(0);
  const pcm = floatToPcm16(channel);
  return bytesToBase64(pcm16ToBytes(pcm));
}

/** Int16Array → Base64 PCM. Atajo para pruebas y para audio ya preparado. */
export function pcm16ToBase64(pcm: Int16Array): string {
  return bytesToBase64(pcm16ToBytes(pcm));
}

/** Duración en milisegundos de una cadena Base64 de PCM 24 kHz mono 16-bit. */
export function base64Pcm24kDurationMs(base64: string): number {
  const bytes = base64ToBytes(base64).length;
  const samples = bytes / PCM_BYTES_PER_SAMPLE;
  return (samples / PCM_SAMPLE_RATE) * 1000;
}

/**
 * Reproduce el algoritmo de fragmentación del SDK instalado
 * (`splitPcm24kStringToChunks`), para poder verificarlo localmente.
 */
export function splitPcm24kBase64ToChunks(base64: string): string[] {
  const chunks: string[] = [];
  if (base64.length === 0) return chunks;

  chunks.push(base64.slice(0, FIRST_CHUNK_CHARS));
  for (let i = FIRST_CHUNK_CHARS; i < base64.length; i += SUBSEQUENT_CHUNK_CHARS) {
    chunks.push(base64.slice(i, i + SUBSEQUENT_CHUNK_CHARS));
  }
  return chunks;
}

/** Valida que la cadena sea Base64 de PCM 24 kHz mono 16-bit con duración razonable. */
export function validateBase64Pcm24k(base64: string, maxDurationMs = 120_000): PcmValidation {
  if (typeof base64 !== 'string' || base64.length === 0) {
    return { ok: false, reason: 'La cadena de audio está vacía.' };
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    return { ok: false, reason: 'La cadena no es Base64 válido.' };
  }

  let bytes: number;
  try {
    bytes = base64ToBytes(base64).length;
  } catch {
    return { ok: false, reason: 'No se pudo decodificar el Base64.' };
  }

  if (bytes % PCM_BYTES_PER_SAMPLE !== 0) {
    return { ok: false, reason: 'El número de bytes no es múltiplo de 2 (muestras de 16 bits).', bytes };
  }

  const durationMs = (bytes / PCM_BYTES_PER_SAMPLE / PCM_SAMPLE_RATE) * 1000;
  if (durationMs > maxDurationMs) {
    return { ok: false, reason: `El audio supera ${maxDurationMs} ms.`, bytes, durationMs };
  }

  return { ok: true, bytes, durationMs };
}

/** Genera una señal sintética (seno) para pruebas locales, sin red ni claves. */
export function generateToneBase64(
  durationMs: number,
  frequencyHz = 440,
  sampleRate = PCM_SAMPLE_RATE,
): string {
  const samples = Math.round((durationMs / 1000) * sampleRate);
  const buffer = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    // Amplitud moderada para no saturar.
    buffer[i] = Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate) * 0.25;
  }
  return pcm16ToBase64(floatToPcm16(buffer));
}

/* ------------------------------------------------------------------ */
/* WAV (con cabecera) → PCM sin cabecera                               */
/* ------------------------------------------------------------------ */

export interface WavInfo {
  audioFormat: number;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  /** PCM sin cabecera, en Base64. */
  pcmBase64: string;
}

/**
 * Extrae el bloque `data` de un WAV (RIFF) en Base64.
 *
 * Gemini TTS devuelve, en peticiones unarias, un **WAV completo (16-bit PCM,
 * 24 kHz, mono)**; LiveAvatar exige **PCM sin cabecera**. No se asume un
 * encabezado de 44 bytes: se recorren los chunks reales del RIFF.
 *
 * @returns `null` si la entrada no es un WAV válido.
 */
export function extractWavPcm(base64Wav: string): WavInfo | null {
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(base64Wav);
  } catch {
    return null;
  }
  if (bytes.length < 44) return null;

  const ascii = (offset: number, length: number): string =>
    String.fromCharCode(...Array.from(bytes.subarray(offset, offset + length)));

  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE') return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let sampleRate = 0;
  let audioFormat = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let pcmBytes: Uint8Array | null = null;

  while (offset + 8 <= bytes.length) {
    const chunkId = ascii(offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;

    if (chunkId === 'fmt ' && dataStart + 16 <= bytes.length) {
      audioFormat = view.getUint16(dataStart, true);
      channels = view.getUint16(dataStart + 2, true);
      sampleRate = view.getUint32(dataStart + 4, true);
      bitsPerSample = view.getUint16(dataStart + 14, true);
    } else if (chunkId === 'data') {
      const end = Math.min(dataStart + chunkSize, bytes.length);
      pcmBytes = bytes.subarray(dataStart, end);
      break;
    }

    // Los chunks RIFF se alinean a 2 bytes.
    offset = dataStart + chunkSize + (chunkSize % 2);
  }

  if (pcmBytes === null || sampleRate === 0 || pcmBytes.length === 0) return null;

  return { audioFormat, sampleRate, channels, bitsPerSample, pcmBase64: bytesToBase64(pcmBytes) };
}

/** Remuestrea PCM 16-bit mono por interpolación lineal. */
export function resamplePcm16Mono(pcm: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate || pcm.length === 0) return pcm;

  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.floor(pcm.length / ratio));
  const output = new Int16Array(outLength);

  for (let i = 0; i < outLength; i += 1) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, pcm.length - 1);
    const frac = src - i0;
    const a = pcm[i0] ?? 0;
    const b = pcm[i1] ?? 0;
    output[i] = Math.round(a + (b - a) * frac);
  }

  return output;
}

/** Decodifica Base64 de PCM 16-bit little-endian a Int16Array. */
export function base64ToPcm16(base64: string): Int16Array {
  const bytes = base64ToBytes(base64);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = new Int16Array(Math.floor(bytes.length / PCM_BYTES_PER_SAMPLE));
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = view.getInt16(i * PCM_BYTES_PER_SAMPLE, true);
  }
  return samples;
}

/**
 * Normaliza CUALQUIER entrada admitida a **PCM 16-bit, 24 kHz, mono, Base64**
 * (el único formato que acepta `LiveAvatarSession.repeatAudio`).
 *
 * Acepta:
 *  - WAV (RIFF) con PCM 16-bit mono → se le quita la cabecera.
 *  - PCM crudo 16-bit mono → se usa tal cual.
 *  - Cualquier frecuencia → se remuestrea a 24 kHz.
 */
export function toLiveAvatarPcm24k(
  base64Audio: string,
  maxDurationMs = 120_000,
): PcmValidation & { pcmBase64?: string } {
  // 1) ¿Es un WAV? Se extrae el PCM y se leen sus parámetros reales.
  const wav = extractWavPcm(base64Audio);
  let pcmBase64 = base64Audio;
  let sourceRate = PCM_SAMPLE_RATE;

  if (wav !== null) {
    if (wav.audioFormat !== 1) {
      return { ok: false, reason: `Se requiere WAV PCM sin comprimir; se recibió formato ${wav.audioFormat}.` };
    }
    if (wav.bitsPerSample !== PCM_BITS_PER_SAMPLE) {
      return { ok: false, reason: `Se requiere PCM 16-bit; se recibió ${wav.bitsPerSample}-bit.` };
    }
    if (wav.channels !== PCM_CHANNELS) {
      return { ok: false, reason: `Se requiere mono; se recibieron ${wav.channels} canales.` };
    }
    pcmBase64 = wav.pcmBase64;
    sourceRate = wav.sampleRate;
  }

  // 2) Remuestreo a 24 kHz cuando haga falta.
  if (sourceRate !== PCM_SAMPLE_RATE) {
    const resampled = resamplePcm16Mono(base64ToPcm16(pcmBase64), sourceRate, PCM_SAMPLE_RATE);
    pcmBase64 = pcm16ToBase64(resampled);
  }

  // 3) Validación final del formato exigido por LiveAvatar.
  const validation = validateBase64Pcm24k(pcmBase64, maxDurationMs);
  return { ...validation, pcmBase64: validation.ok ? pcmBase64 : undefined };
}

/** Construye un WAV PCM 16-bit mono a partir de PCM crudo (para pruebas locales). */
export function buildWavFromPcm16Mono(pcm: Int16Array, sampleRate = PCM_SAMPLE_RATE): string {
  const dataBytes = pcm16ToBytes(pcm);
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);

  const writeAscii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) header[offset + i] = text.charCodeAt(i);
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes.length, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // tamaño del chunk fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, PCM_CHANNELS, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * PCM_CHANNELS * PCM_BYTES_PER_SAMPLE, true); // byteRate
  view.setUint16(32, PCM_CHANNELS * PCM_BYTES_PER_SAMPLE, true); // blockAlign
  view.setUint16(34, PCM_BITS_PER_SAMPLE, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes.length, true);

  const wav = new Uint8Array(header.length + dataBytes.length);
  wav.set(header, 0);
  wav.set(dataBytes, header.length);
  return bytesToBase64(wav);
}
