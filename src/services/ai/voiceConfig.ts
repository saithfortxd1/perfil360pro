/**
 * Política de voz predeterminada para el simulador de Perfil 360 AI.
 * La API Web Speech no permite garantizar una identidad o género concreto por nombre.
 */

export const SIMULATOR_VOICE_CONFIG = {
  /** Velocidad predeterminada fija para todas las intervenciones de los entrevistadores */
  DEFAULT_RATE: 1.10,
  /** No se recuperó una voz anterior única; se preserva el URI guardado o se detecta una voz española al iniciar. */
  PREFERRED_VOICE_NAME: null,
  /** Si el nombre/URI lo permite, prioriza una voz española probablemente masculina. */
  PREFER_MALE_SPANISH: true,
  /** Idioma base esperado */
  DEFAULT_LANG: 'es-ES',
} as const;
