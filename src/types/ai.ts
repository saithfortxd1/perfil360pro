/**
 * Tipos para el módulo de Inteligencia Artificial y Simulador Inmersivo
 * Perfil 360 AI - Fase 3
 */

/** Roles en la conversación */
export type MessageRole = 'user' | 'model' | 'system' | 'event';

/** Tipos de eventos de simulación */
export type SimulationEventType =
  | 'context_change'
  | 'resource_constraint'
  | 'new_information'
  | 'priority_shift'
  | 'external_event'
  | 'opportunity'
  | 'crisis'
  | 'breakthrough';

/** Estados de un evento de simulación */
export type SimulationEventStatus =
  | 'pending'
  | 'active'
  | 'resolved'
  | 'dismissed';

/** Estados de la simulación */
export type SimulationStatus =
  | 'idle'
  | 'initializing'
  | 'active'
  | 'paused'
  | 'chaos_pending'
  | 'chaos_active'
  | 'error'
  | 'completed';

/** Roles de usuario en la simulación */
export type SimulationRole =
  | 'profesional'
  | 'lider'
  | 'emprendedor'
  | 'estudiante'
  | 'consultor';

/** Escenarios de simulación predefinidos */
export type ScenarioId =
  | 'entrevista_tecnica'
  | 'negociacion_salarial'
  | 'gestion_crisis'
  | 'lanzamiento_producto'
  | 'cambio_carrera'
  | 'liderazgo_equipo'
  | 'networking_evento'
  | 'presentacion_inversion';

/** Mensaje en la conversación */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  metadata?: {
    eventId?: string;
    scenarioId?: ScenarioId;
    tokens?: number;
    model?: string;
    isLocalFallback?: boolean;
    isCandidateName?: boolean;
  };
}

/** Evento de simulación (Modo Caos) */
export interface SimulationEvent {
  id: string;
  type: SimulationEventType;
  title: string;
  description: string;
  createdAt: number;
  scenarioChanges: Partial<ScenarioState>;
  status: SimulationEventStatus;
  relatedMessageId?: string;
}

/** Estado del escenario actual */
export interface ScenarioState {
  id: ScenarioId;
  title: string;
  description: string;
  objectives: string[];
  currentSituation: string;
  resources: {
    tiempo: number;
    presupuesto: number;
    energia: number;
    redContactos: number;
  };
  constraints: string[];
  progress: number; // 0-100
}

/** Configuración de un escenario */
export interface ScenarioConfig {
  id: ScenarioId;
  title: string;
  description: string;
  role: SimulationRole;
  initialState: ScenarioState;
  systemPrompt: string;
  chaosEvents: ChaosEventTemplate[];
}

/** Plantilla para eventos de caos */
export interface ChaosEventTemplate {
  type: SimulationEventType;
  title: string;
  description: string;
  scenarioChanges: Partial<ScenarioState>;
  weight: number; // Probabilidad relativa
  compatibleScenarios: ScenarioId[];
}

/** Contexto de la simulación para el modelo */
export interface SimulationContext {
  scenario: ScenarioConfig;
  currentState: ScenarioState;
  activeEvents: SimulationEvent[];
  messageHistory: ChatMessage[];
  userProfile: {
    role: SimulationRole;
    experienceLevel: string;
  };
}

/** Estado completo de la simulación */
export interface SimulationSession {
  id: string;
  scenarioId: ScenarioId;
  candidateName?: string;
  status: SimulationStatus;
  scenarioState: ScenarioState;
  messages: ChatMessage[];
  events: SimulationEvent[];
  chaosAvailable: boolean;
  chaosCooldown: number;
  createdAt: number;
  updatedAt: number;
}

/** Resultado de enviar un mensaje */
export interface SendMessageResult {
  message: ChatMessage;
  events: SimulationEvent[];
  scenarioState: ScenarioState;
}

/** Resultado de activar Modo Caos */
export interface ChaosTriggerResult {
  event: SimulationEvent;
  response: ChatMessage;
  scenarioState: ScenarioState;
}

/** Configuración del servicio Gemini */
export interface GeminiConfig {
  model: string;
  maxContextTokens: number;
  maxMessageLength: number;
  /** Longitud máxima de la respuesta generada. Un valor bajo reduce la latencia. */
  maxOutputTokens: number;
  temperature: number;
  topP: number;
  topK: number;
}

export type AiErrorCategory =
  | 'AUTHENTICATION_ERROR'
  | 'PERMISSION_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'PROVIDER_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT_ERROR'
  | 'INVALID_RESPONSE'
  | 'PERSISTENCE_ERROR'
  | 'CANCELLED'
  | 'UNKNOWN_ERROR';

/** Safe, normalized service error metadata; source details are optional and non-sensitive. */
export interface AIServiceFailure {
  message: string;
  code: string;
  retryable: boolean;
  category?: AiErrorCategory;
  httpStatus?: number;
  sourceCode?: string;
  sourceStatus?: number;
  details?: Record<string, unknown>;
}

/** Error tipado del servicio AI */
export class AIServiceError extends Error {
  constructor(
    message: string,
    public readonly aiCode: string,
    public readonly retryable: boolean = false,
    public readonly originalError?: Error,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AIServiceError';
  }
}

export type AIErrorCode =
  | 'CONFIG_MISSING'
  | 'API_KEY_INVALID'
  | 'RATE_LIMIT_EXCEEDED'
  | 'QUOTA_EXCEEDED'
  | 'MODEL_UNAVAILABLE'
  | 'CONTEXT_TOO_LONG'
  | 'MESSAGE_TOO_LONG'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'CHAOS_COOLDOWN'
  | 'NO_ACTIVE_SIMULATION'
  | 'SIMULATION_COMPLETED'
  | 'UNKNOWN_ERROR';

/** Resultado tipado para operaciones AI */
export type AIResult<T> =
  | { ok: true; value: T }
    | { ok: false; error: AIServiceFailure & { originalError?: Error } };

/** Configuración por defecto */
export const DEFAULT_GEMINI_CONFIG: Partial<GeminiConfig> = {
  model: 'gemini-3.5-flash',
  maxContextTokens: 30000,
  maxMessageLength: 4000,
  // Respuestas breves (una pregunta por turno) → menor latencia percibida.
  maxOutputTokens: 420,
  // Temperatura más baja → entrevistador más consistente y objetivo.
  temperature: 0.55,
  topP: 0.9,
  topK: 40,
};

/** Límites de uso */
export const USAGE_LIMITS = {
  maxContextMessages: 50,
  maxMessageLength: 4000,
  chaosCooldownMs: 30000, // 30 segundos
  maxConcurrentRequests: 1,
  requestTimeoutMs: 30000,
};

/** Helpers para crear resultados AI */
export function aiOk<T>(value: T) {
  return { ok: true, value } as const;
}

export function aiFail(error: { message: string; code: string; retryable?: boolean; details?: Record<string, unknown> }) {
  return { ok: false, error: { message: error.message, code: error.code, retryable: error.retryable ?? false, details: error.details } } as const;
}
