/**
 * Hook de Web Speech API para Perfil 360 AI.
 *
 * Dos subsistemas INDEPENDIENTES que no deben confundirse:
 *  - TTS (síntesis de voz): window.speechSynthesis + getVoices()
 *  - STT (reconocimiento de voz): SpeechRecognition / webkitSpeechRecognition
 *
 * Notas de compatibilidad reales:
 *  - Chrome/Edge exponen SpeechRecognition (STT) y voces del sistema.
 *  - Firefox NO implementa SpeechRecognition (STT) en versiones estables, pero
 *    SÍ puede capturar audio con getUserMedia. Por eso hay que distinguir
 *    "no hay micrófono" de "no hay motor de reconocimiento".
 *  - Las voces de Microsoft (SAPI/OneCore en Windows) se excluyen de la
 *    selección normal: baja calidad para una entrevista profesional.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* ---------------------------------------------------------------- */
/* Tipos de reconocimiento (no existen en lib.dom de forma estable)  */
/* ---------------------------------------------------------------- */

interface SpeechRecognitionEventLike extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

export type VoiceGender = 'female' | 'male' | 'unknown';

export interface VoiceOption {
  voice: SpeechSynthesisVoice;
  name: string;
  lang: string;
  /** 'unknown' cuando el proveedor no declara el género (caso de Web Speech API). */
  gender: VoiceGender;
  isSpanish: boolean;
  isLatinSpanish: boolean;
  /** true si es una voz del sistema que excluimos por defecto (Microsoft/SAPI). */
  isSystemVoice: boolean;
}

/** Resultado de la comprobación del dispositivo de micrófono. */
export type MicProbeResult =
  | 'available'
  | 'unsupported'
  | 'no-device'
  | 'denied'
  | 'busy'
  | 'insecure-context'
  | 'unknown';

export interface UseSpeechOptions {
  lang?: string;
  voicePreferenceKey?: string;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onError?: (error: MicProbeResult | 'recognition-error', detail?: string) => void;
}

export interface UseSpeechReturn {
  // STT
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  startListening: () => void;
  stopListening: () => void;
  /** Comprueba el dispositivo de micrófono. Debe llamarse tras una acción del usuario. */
  probeMicrophone: () => Promise<MicProbeResult>;
  micProbe: MicProbeResult | null;
  // TTS
  isSpeaking: boolean;
  speak: (text: string) => void;
  stopSpeaking: () => void;
  pauseSpeaking: () => void;
  resumeSpeaking: () => void;
  voices: VoiceOption[];
  /** Voces del sistema excluidas de la lista principal. */
  excludedSystemVoices: VoiceOption[];
  includeSystemVoices: boolean;
  setIncludeSystemVoices: (value: boolean) => void;
  selectedVoice: VoiceOption | null;
  selectVoice: (voiceURI: string) => void;
  rate: number;
  setRate: (rate: number) => void;
  previewVoice: (voiceURI?: string, text?: string) => void;
  // Capacidades
  supported: { tts: boolean; stt: boolean; mediaDevices: boolean };
  /** Mensaje informativo cuando no hay voces válidas. */
  voicesNotice: string | null;
}

/* ---------------------------------------------------------------- */
/* Utilidades de voz                                                 */
/* ---------------------------------------------------------------- */

const VOICE_PREFERENCE_KEY = 'perfil360.voice.uri';
const RATE_PREFERENCE_KEY = 'perfil360.voice.rate';
const INCLUDE_SYSTEM_KEY = 'perfil360.voice.includeSystem';

const LATIN_SPANISH_REGIONS = ['es-mx', 'es-us', 'es-419', 'es-ar', 'es-co', 'es-cl', 'es-pe', 'es-ve', 'es-uy', 'es-ec', 'es-419'];

/**
 * Detecta voces del sistema (Microsoft/SAPI/OneCore) usando TODOS los metadatos
 * disponibles (`name` y `voiceURI`), no solo el nombre.
 */
function isSystemVoice(voice: SpeechSynthesisVoice): boolean {
  const haystack = `${voice.name} ${voice.voiceURI}`.toLowerCase();
  return haystack.includes('microsoft') || haystack.includes('msft') || haystack.includes('sapi');
}

function isLatinSpanish(lang: string): boolean {
  const lower = lang.toLowerCase();
  return LATIN_SPANISH_REGIONS.some((region) => lower.startsWith(region));
}

/**
 * Ordena: español latinoamericano → español → resto.
 * Las voces del sistema puntúan al final.
 */
function rankVoice(option: VoiceOption): number {
  if (option.isSystemVoice) return 3;
  if (option.isLatinSpanish) return 0;
  if (option.isSpanish) return 1;
  return 2;
}

/* ---------------------------------------------------------------- */
/* Hook                                                              */
/* ---------------------------------------------------------------- */

export function useSpeech(options: UseSpeechOptions = {}): UseSpeechReturn {
  const { lang = 'es-ES', voicePreferenceKey = VOICE_PREFERENCE_KEY, onTranscript, onError } = options;

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [rawVoices, setRawVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | null>(null);
  const [rate, setRateState] = useState(1);
  const [includeSystemVoices, setIncludeSystemVoicesState] = useState(false);
  const [voicesNotice, setVoicesNotice] = useState<string | null>(null);
  const [micProbe, setMicProbe] = useState<MicProbeResult | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const transcriptHandlerRef = useRef(onTranscript);
  const errorHandlerRef = useRef(onError);

  transcriptHandlerRef.current = onTranscript;
  errorHandlerRef.current = onError;

  const supported = useMemo(
    () => ({
      tts: typeof window !== 'undefined' && 'speechSynthesis' in window,
      stt: typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window),
      mediaDevices: typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function',
    }),
    [],
  );

  /* --------------------------- TTS: voces --------------------------- */

  useEffect(() => {
    if (!supported.tts) return;

    const synth = window.speechSynthesis;
    synthRef.current = synth;

    const loadVoices = () => {
      const list = synth.getVoices();
      if (list.length > 0) setRawVoices(list);
    };

    loadVoices();
    synth.addEventListener?.('voiceschanged', loadVoices);

    // Preferencias persistidas
    if (typeof localStorage !== 'undefined') {
      const savedUri = localStorage.getItem(voicePreferenceKey);
      setSelectedVoiceURI(savedUri);
      const savedRate = localStorage.getItem(RATE_PREFERENCE_KEY);
      if (savedRate) {
        const parsed = Number(savedRate);
        if (Number.isFinite(parsed) && parsed >= 0.5 && parsed <= 1.5) setRateState(parsed);
      }
      if (localStorage.getItem(INCLUDE_SYSTEM_KEY) === 'true') setIncludeSystemVoicesState(true);
    }

    return () => {
      synth.removeEventListener?.('voiceschanged', loadVoices);
    };
  }, [supported.tts, voicePreferenceKey]);

  const allVoices = useMemo<VoiceOption[]>(() => {
    const seen = new Set<string>();
    const result: VoiceOption[] = [];

    for (const voice of rawVoices) {
      if (seen.has(voice.voiceURI)) continue;
      seen.add(voice.voiceURI);

      const voiceLang = voice.lang || '';
      result.push({
        voice,
        name: voice.name,
        lang: voiceLang,
        // Web Speech API no declara género: no lo deducimos del nombre.
        gender: 'unknown',
        isSpanish: voiceLang.toLowerCase().startsWith('es'),
        isLatinSpanish: isLatinSpanish(voiceLang),
        isSystemVoice: isSystemVoice(voice),
      });
    }

    return result.sort((a, b) => rankVoice(a) - rankVoice(b));
  }, [rawVoices]);

  const excludedSystemVoices = useMemo(
    () => allVoices.filter((option) => option.isSystemVoice),
    [allVoices],
  );

  const voices = useMemo(
    () => (includeSystemVoices ? allVoices : allVoices.filter((option) => !option.isSystemVoice)),
    [allVoices, includeSystemVoices],
  );

  const selectedVoice = useMemo<VoiceOption | null>(() => {
    if (voices.length === 0) return null;
    if (selectedVoiceURI) {
      const found = voices.find((option) => option.voice.voiceURI === selectedVoiceURI);
      if (found) return found;
    }
    return voices.find((option) => option.isLatinSpanish) ?? voices.find((option) => option.isSpanish) ?? voices[0] ?? null;
  }, [voices, selectedVoiceURI]);

  // Aviso cuando no hay voces válidas (no sustituimos en silencio).
  useEffect(() => {
    if (!supported.tts) {
      setVoicesNotice('Este navegador no permite síntesis de voz. Podrás leer las preguntas en pantalla.');
      return;
    }
    if (rawVoices.length === 0) {
      setVoicesNotice('El navegador todavía no ha cargado ninguna voz.');
      return;
    }
    if (voices.length === 0) {
      setVoicesNotice(
        'No hay voces profesionales disponibles. Solo se detectaron voces del sistema (Microsoft), excluidas por defecto. Puedes habilitarlas desde la configuración de voz.',
      );
      return;
    }
    setVoicesNotice(null);
  }, [supported.tts, rawVoices.length, voices.length]);

  const selectVoice = useCallback((voiceURI: string) => {
    setSelectedVoiceURI(voiceURI);
    if (typeof localStorage !== 'undefined') localStorage.setItem(voicePreferenceKey, voiceURI);
  }, [voicePreferenceKey]);

  const setRate = useCallback((value: number) => {
    const clamped = Math.min(1.5, Math.max(0.5, value));
    setRateState(clamped);
    if (typeof localStorage !== 'undefined') localStorage.setItem(RATE_PREFERENCE_KEY, String(clamped));
  }, []);

  const setIncludeSystemVoices = useCallback((value: boolean) => {
    setIncludeSystemVoicesState(value);
    if (typeof localStorage !== 'undefined') localStorage.setItem(INCLUDE_SYSTEM_KEY, String(value));
  }, []);

  const speakWith = useCallback(
    (text: string, voiceOption: VoiceOption | null, speed: number) => {
      const synth = synthRef.current;
      if (!synth || !supported.tts) return;

      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = voiceOption?.lang || lang;
      if (voiceOption) utterance.voice = voiceOption.voice;
      utterance.rate = speed;
      utterance.pitch = 1;
      utterance.volume = 1;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = (event) => {
        // 'interrupted' y 'canceled' se producen al cancelar; no son fallos reales.
        if (event.error !== 'interrupted' && event.error !== 'canceled') {
          console.error('[SpeechSynthesis] error:', event.error);
        }
        setIsSpeaking(false);
      };

      synth.speak(utterance);
    },
    [lang, supported.tts],
  );

  const speak = useCallback((text: string) => speakWith(text, selectedVoice, rate), [speakWith, selectedVoice, rate]);

  const previewVoice = useCallback(
    (voiceURI?: string, text = 'Hola, soy su entrevistadora. ¿Podemos comenzar la entrevista?') => {
      const target = voiceURI
        ? voices.find((option) => option.voice.voiceURI === voiceURI) ?? selectedVoice
        : selectedVoice;
      speakWith(text, target, rate);
    },
    [voices, selectedVoice, speakWith, rate],
  );

  const stopSpeaking = useCallback(() => {
    synthRef.current?.cancel();
    setIsSpeaking(false);
  }, []);

  const pauseSpeaking = useCallback(() => synthRef.current?.pause(), []);
  const resumeSpeaking = useCallback(() => synthRef.current?.resume(), []);

  /* ------------------- STT: reconocimiento de voz ------------------- */

  useEffect(() => {
    if (!supported.stt) return;

    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let finalText = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        const segment = result[0]?.transcript ?? '';
        if (result.isFinal) finalText += segment;
        else interimText += segment;
      }

      if (finalText) {
        setTranscript((prev) => prev + finalText);
        transcriptHandlerRef.current?.(finalText, true);
      }
      setInterimTranscript(interimText);
      if (interimText) transcriptHandlerRef.current?.(interimText, false);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      const code = event.error;
      // 'no-speech' y 'aborted' son habituales y no requieren acción.
      if (code !== 'no-speech' && code !== 'aborted') {
        console.error('[SpeechRecognition] error:', code);
      }
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setMicProbe('denied');
        errorHandlerRef.current?.('denied', code);
      } else if (code === 'audio-capture') {
        setMicProbe('no-device');
        errorHandlerRef.current?.('no-device', code);
      } else if (code === 'network') {
        errorHandlerRef.current?.('recognition-error', code);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [lang, supported.stt]);

  const startListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    setTranscript('');
    setInterimTranscript('');
    try {
      recognition.start();
    } catch (error) {
      // start() lanza si ya está activo; lo tratamos como no-op.
      console.warn('[SpeechRecognition] no se pudo iniciar:', error instanceof Error ? error.message : 'unknown');
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  /**
   * Comprueba el dispositivo de micrófono. Libera las pistas inmediatamente.
   * Debe invocarse tras una acción del usuario, nunca al cargar la página.
   */
  const probeMicrophone = useCallback(async (): Promise<MicProbeResult> => {
    if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost') {
      setMicProbe('insecure-context');
      return 'insecure-context';
    }

    if (!supported.mediaDevices) {
      // Firefox admite getUserMedia, pero algunos navegadores antiguos no.
      const result: MicProbeResult = supported.stt ? 'unknown' : 'unsupported';
      setMicProbe(result);
      return result;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Liberamos las pistas de inmediato: solo queríamos comprobar disponibilidad.
      stream.getTracks().forEach((track) => track.stop());
      setMicProbe('available');
      return 'available';
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      let result: MicProbeResult = 'unknown';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') result = 'denied';
      else if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') result = 'no-device';
      else if (name === 'NotReadableError' || name === 'TrackStartError') result = 'busy';
      else if (name === 'SecurityError') result = 'insecure-context';

      setMicProbe(result);
      return result;
    }
  }, [supported.mediaDevices, supported.stt]);

  // Liberar la síntesis al desmontar.
  useEffect(() => {
    return () => {
      synthRef.current?.cancel();
    };
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    probeMicrophone,
    micProbe,
    isSpeaking,
    speak,
    stopSpeaking,
    pauseSpeaking,
    resumeSpeaking,
    voices,
    excludedSystemVoices,
    includeSystemVoices,
    setIncludeSystemVoices,
    selectedVoice,
    selectVoice,
    rate,
    setRate,
    previewVoice,
    supported,
    voicesNotice,
  };
}
