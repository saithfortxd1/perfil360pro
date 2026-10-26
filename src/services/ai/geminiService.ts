import type {
  ChatMessage,
  SimulationEvent,
  ScenarioState,
  ScenarioConfig,
  SimulationSession,
  GeminiConfig,
} from '@/types/ai';
import { DEFAULT_GEMINI_CONFIG } from '@/types/ai';
import { getFirebaseIdToken } from '@/services/firebase/idToken';
import { DEFAULT_INTERVIEWER, type InterviewerProfile } from '@/services/ai/interviewers';

/**
 * Plantilla de evento inesperado del Modo Caos.
 * `compatibleScenarios` vacío significa "aplicable a cualquier escenario".
 */
interface ChaosTemplate {
  type: SimulationEvent['type'];
  title: string;
  description: string;
  scenarioChanges: Partial<ScenarioState>;
  weight: number;
  compatibleScenarios: string[];
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: { text: string }[];
}

const PRIMARY_MODEL = 'gemini-3.5-flash';

/**
 * Servicio centralizado de Inteligencia Artificial con Gemini
 * Maneja conversaciones, simulaciones y Modo Caos
 * Incluye estrategia de fallback: gemini-3.5-flash → gemini-3.5-flash-lite
 */
class GeminiService {
  private chatHistory: GeminiContent[] = [];
  private config: GeminiConfig | null = null;
  private currentSession: SimulationSession | null = null;
  private abortController: AbortController | null = null;
  private isProcessing = false;
  private lastChaosTrigger = 0;
  /** Secuencia de turno: permite descartar respuestas obsoletas. */
  private requestSeq = 0;
  private usingFallback = false;

  /**
   * Prepara el cliente local; las credenciales y la configuración del modelo viven en el servidor.
   */
  initialize(config?: Partial<GeminiConfig>): { ok: true; value: void } | { ok: false; error: { message: string; code: string; retryable: boolean; details?: Record<string, unknown>; originalError?: Error } } {
    try {
      this.config = {
        model: config?.model ?? PRIMARY_MODEL,
        maxContextTokens: config?.maxContextTokens ?? DEFAULT_GEMINI_CONFIG.maxContextTokens!,
        maxMessageLength: config?.maxMessageLength ?? DEFAULT_GEMINI_CONFIG.maxMessageLength!,
        maxOutputTokens: config?.maxOutputTokens ?? DEFAULT_GEMINI_CONFIG.maxOutputTokens!,
        temperature: config?.temperature ?? DEFAULT_GEMINI_CONFIG.temperature!,
        topP: config?.topP ?? DEFAULT_GEMINI_CONFIG.topP!,
        topK: config?.topK ?? DEFAULT_GEMINI_CONFIG.topK!,
      };

      this.usingFallback = false;

      return { ok: true, value: undefined };
    } catch (error) {
      console.error('[GeminiService] initialize failed:', error instanceof Error ? error.message : String(error));
      return {
        ok: false,
        error: {
          message: 'Error al inicializar el cliente de Gemini',
          code: 'CONFIG_MISSING',
          retryable: false,
          originalError: error instanceof Error ? error : undefined,
        },
      };
    }
  }

  /**
   * Verifica si el servicio está configurado
   */
  isConfigured(): boolean {
    return this.config !== null;
  }

  /**
   * Obtiene la configuración actual
   */
  getConfig(): GeminiConfig | null {
    return this.config;
  }

  /**
   * Indica si se está usando el modelo de respaldo
   */
  isUsingFallback(): boolean {
    return this.usingFallback;
  }

  /**
   * Genera contenido mediante la función autenticada del servidor.
   */
  async generateContent(prompt: string, signal?: AbortSignal): Promise<{ ok: true; value: string } | { ok: false; error: { message: string; code: string; retryable: boolean } }> {
    if (!this.isConfigured()) {
      return { ok: false, error: { message: 'Servicio Gemini no inicializado', code: 'CONFIG_MISSING', retryable: false } };
    }

    return this.requestText({ prompt }, signal);
  }

  /**
   * Inicia una nueva sesión de simulación con estrategia de fallback
   */
  async startSimulation(
    scenarioConfig: ScenarioConfig,
    userProfile: { role: string; experienceLevel: string },
    interviewer: InterviewerProfile = DEFAULT_INTERVIEWER,
  ): Promise<{ ok: true; value: SimulationSession } | { ok: false; error: { message: string; code: string; retryable: boolean } }> {
    if (!this.isConfigured()) {
      return { ok: false, error: { message: 'Servicio Gemini no inicializado', code: 'CONFIG_MISSING', retryable: false } };
    }

    if (this.isProcessing) {
      return { ok: false, error: { message: 'Ya hay una operación en curso', code: 'UNKNOWN_ERROR', retryable: true } };
    }

    this.isProcessing = true;
    this.abortController = new AbortController();

    try {
      const sessionId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const initialState = { ...scenarioConfig.initialState };

      this.currentSession = {
        id: sessionId,
        scenarioId: scenarioConfig.id,
        status: 'active',
        scenarioState: initialState,
        messages: [],
        events: [],
        chaosAvailable: true,
        chaosCooldown: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const systemPrompt = this.buildSystemPrompt(scenarioConfig, userProfile, initialState, interviewer);
      this.chatHistory = [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Entendido. Iniciemos la simulación.' }] },
      ];

      const welcomeMessage = await this.generateWelcomeMessageWithModel(scenarioConfig, initialState, interviewer);
      this.currentSession.messages.push(welcomeMessage);
      this.usingFallback = false;
      return { ok: true, value: this.currentSession };
    } catch (error) {
      this.currentSession = null;
      this.chatHistory = [];
      console.error('[GeminiService] startSimulation failed:', error instanceof Error ? error.message : String(error));
      return { ok: false, error: this.mapGeminiError(error) };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Inicia una simulación con un escenario dinámico generado por IA
   */
  async startDynamicSimulation(
    dynamicScenario: { id: string; title: string; description: string; difficulty: string },
    userProfile: { role: string; experienceLevel: string; skills?: string[]; yearsOfExperience?: number },
    interviewer: InterviewerProfile = DEFAULT_INTERVIEWER,
  ): Promise<{ ok: true; value: SimulationSession } | { ok: false; error: { message: string; code: string; retryable: boolean } }> {
    const scenarioConfig: ScenarioConfig = {
      id: dynamicScenario.id as any,
      title: dynamicScenario.title,
      description: dynamicScenario.description,
      role: (userProfile.role as any) || 'profesional',
      initialState: {
        id: dynamicScenario.id as any,
        title: dynamicScenario.title,
        description: dynamicScenario.description,
        currentSituation: `Escenario de entrevista: ${dynamicScenario.title}. ${dynamicScenario.description}`,
        objectives: [
          'Demostrar competencias profesionales',
          'Responder con claridad y estructura',
          'Manejar situaciones inesperadas',
        ],
        constraints: [
          `Dificultad: ${dynamicScenario.difficulty}`,
          'Tiempo limitado',
        ],
        progress: 0,
        resources: {
          tiempo: 100,
          presupuesto: 100,
          energia: 100,
          redContactos: 100,
        },
      },
      systemPrompt: '',
      chaosEvents: [],
    };

    return this.startSimulation(scenarioConfig, userProfile, interviewer);
  }

  /**
   * Envía un mensaje del usuario y obtiene respuesta
   */
  async sendMessage(content: string): Promise<{ ok: true; value: { message: ChatMessage; events: never[]; scenarioState: ScenarioState } } | { ok: false; error: { message: string; code: string; retryable: boolean } }> {
    if (!this.currentSession || this.chatHistory.length === 0) {
      return { ok: false, error: { message: 'No hay simulación activa', code: 'NO_ACTIVE_SIMULATION', retryable: false } };
    }

    if (this.currentSession.status !== 'active') {
      return { ok: false, error: { message: 'La simulación no está activa', code: 'SIMULATION_COMPLETED', retryable: false } };
    }

    if (this.isProcessing) {
      return { ok: false, error: { message: 'Ya hay una respuesta en curso. Espera un momento.', code: 'BUSY', retryable: false } };
    }

    if (!content.trim()) {
      return { ok: false, error: { message: 'El mensaje no puede estar vacío', code: 'MESSAGE_TOO_LONG', retryable: false } };
    }

    if (content.length > 4000) {
      return { ok: false, error: { message: 'El mensaje supera el límite de 4000 caracteres', code: 'MESSAGE_TOO_LONG', retryable: false } };
    }

    this.isProcessing = true;
    this.abortController = new AbortController();

    // Secuencia de turno: si el usuario interrumpe y empieza otro turno,
    // la respuesta antigua se descarta en lugar de sobrescribir el estado nuevo.
    const seq = ++this.requestSeq;
    const turnStart = performance.now();

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    };

    // El mensaje del usuario se añade UNA sola vez, fuera del bucle de reintentos.
    this.currentSession.messages.push(userMessage);
    this.latencyMark('turno preparado', turnStart);

    const MAX_ATTEMPTS = 3;
    const BACKOFF_MS = [0, 600, 1400];
    let lastError: { message: string; code: string; retryable: boolean } | null = null;

    try {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        if (attempt > 0) {
          await GeminiService.sleep(BACKOFF_MS[attempt] ?? 1400);
          if (seq !== this.requestSeq) {
            return { ok: false, error: { message: 'Turno cancelado por una intervención más reciente.', code: 'ABORTED', retryable: false } };
          }
        }

        try {
          const modelStart = performance.now();
          const userTurn: GeminiContent = { role: 'user', parts: [{ text: content.trim() }] };
          const result = await this.requestText(
            { contents: [...this.chatHistory, userTurn] },
            this.abortController?.signal,
          );
          if (!result.ok) {
            lastError = result.error;
            if (!lastError.retryable) break;
            continue;
          }
          const responseText = result.value;
          this.latencyMark('respuesta de Gemini', modelStart);
          this.latencyMark('turno completo (usuario → texto de respuesta)', turnStart);

          if (!responseText || !responseText.trim()) {
            lastError = { message: 'El servicio de IA devolvió una respuesta vacía.', code: 'EMPTY_RESPONSE', retryable: true };
            continue;
          }

          // Descarta la respuesta si ya empezó un turno más reciente.
          if (seq !== this.requestSeq) {
            return { ok: false, error: { message: 'Respuesta descartada: hay un turno más reciente.', code: 'STALE_RESPONSE', retryable: false } };
          }

          const modelMessage: ChatMessage = {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            role: 'model',
            content: responseText,
            timestamp: Date.now(),
          };

          this.currentSession.messages.push(modelMessage);
          this.chatHistory.push(userTurn, { role: 'model', parts: [{ text: responseText }] });

          const updatedState = this.extractScenarioState(responseText, this.currentSession.scenarioState);
          this.currentSession.scenarioState = updatedState;
          this.currentSession.updatedAt = Date.now();

          return { ok: true, value: { message: modelMessage, events: [], scenarioState: updatedState } };
        } catch (attemptError) {
          if (attemptError instanceof Error && attemptError.name === 'AbortError') {
            return { ok: false, error: { message: 'Solicitud cancelada.', code: 'ABORTED', retryable: false } };
          }
          const classified = this.mapGeminiError(attemptError);
          lastError = classified;
          console.error(`[GeminiService] sendMessage intento ${attempt + 1}/${MAX_ATTEMPTS} falló:`, classified.code);

          // Los errores permanentes no se reintentan.
          if (!classified.retryable) break;
        }
      }

      return {
        ok: false,
        error: lastError ?? { message: 'No se pudo obtener respuesta del servicio de IA.', code: 'UNKNOWN_ERROR', retryable: true },
      };
    } finally {
      // Solo liberamos el flag si este sigue siendo el turno actual.
      if (seq === this.requestSeq) this.isProcessing = false;
    }
  }

  /**
   * Activa Modo Caos - introduce un evento inesperado
   */
  async triggerChaos(): Promise<{ ok: true; value: { event: SimulationEvent; response: ChatMessage; scenarioState: ScenarioState } } | { ok: false; error: { message: string; code: string; retryable: boolean } }> {
    if (!this.currentSession || this.chatHistory.length === 0) {
      return { ok: false, error: { message: 'No hay simulación activa', code: 'NO_ACTIVE_SIMULATION', retryable: false } };
    }

    if (this.currentSession.status !== 'active') {
      return { ok: false, error: { message: 'La simulación no está activa', code: 'SIMULATION_COMPLETED', retryable: false } };
    }

    const now = Date.now();
    if (now - this.lastChaosTrigger < 30000) {
      return { ok: false, error: { message: `Modo Caos en enfriamiento. Espera ${Math.ceil((30000 - (now - this.lastChaosTrigger)) / 1000)}s`, code: 'CHAOS_COOLDOWN', retryable: true } };
    }

    if (this.isProcessing) {
      return { ok: false, error: { message: 'Ya hay una operación en curso', code: 'UNKNOWN_ERROR', retryable: true } };
    }

    this.isProcessing = true;
    this.lastChaosTrigger = now;
    this.currentSession.status = 'chaos_active';
    this.abortController = new AbortController();

    try {
      const chaosEvent = this.generateChaosEvent(this.currentSession!);
      if (!chaosEvent) {
        // No simulamos éxito: informamos y dejamos la simulación como estaba.
        this.currentSession!.status = 'active';
        return {
          ok: false,
          error: {
            message: 'No hay un evento inesperado disponible para este escenario. Inténtalo de nuevo en unos segundos.',
            code: 'CHAOS_NO_TEMPLATE',
            retryable: true,
          },
        };
      }

      this.currentSession!.status = 'active';

      const chaosPrompt = this.buildChaosPrompt(chaosEvent);
      const chaosTurn: GeminiContent = { role: 'user', parts: [{ text: chaosPrompt }] };
      const result = await this.requestText(
        { contents: [...this.chatHistory, chaosTurn] },
        this.abortController?.signal,
      );
      if (!result.ok) {
        this.currentSession!.status = 'active';
        return { ok: false, error: result.error };
      }
      const responseText = result.value;
      this.currentSession!.events.push(chaosEvent);

      const chaosResponse: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        role: 'model',
        content: responseText,
        timestamp: Date.now(),
        metadata: { eventId: chaosEvent.id },
      };

      this.currentSession!.messages.push(chaosResponse);
      this.chatHistory.push(chaosTurn, { role: 'model', parts: [{ text: responseText }] });

      const updatedState = this.extractScenarioState(responseText, this.currentSession!.scenarioState);
      chaosEvent.scenarioChanges = { ...updatedState };
      chaosEvent.status = 'active';
      chaosEvent.relatedMessageId = chaosResponse.id;

      this.currentSession!.scenarioState = updatedState;
      this.currentSession!.updatedAt = Date.now();

      return { ok: true, value: { event: chaosEvent, response: chaosResponse, scenarioState: updatedState } };
    } catch (error) {
      if (this.currentSession) this.currentSession.status = 'error';
      console.error('[GeminiService] triggerChaos failed:', error instanceof Error ? error.message : String(error));
      return { ok: false, error: this.mapGeminiError(error) };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Genera escenarios de entrevista dinámicos basados en el perfil del usuario
   * Con reintento automático con prompt simplificado si falla
   */
  async generateScenariosFromProfile(
    userProfile: { fullName?: string; skills?: string[]; yearsOfExperience?: number; headline?: string; bio?: string; goal?: string },
    signal?: AbortSignal,
  ): Promise<{ ok: true; value: { id: string; title: string; description: string; difficulty: string }[] } | { ok: false; error: { message: string; code: string; retryable: boolean } }> {
    if (!this.isConfigured()) {
      return { ok: false, error: { message: 'Servicio Gemini no inicializado', code: 'CONFIG_MISSING', retryable: false } };
    }

    const skills = userProfile.skills?.join(', ') || 'No especificadas';
    const experience = userProfile.yearsOfExperience || 0;
    const headline = userProfile.headline || 'Profesional';
    const bio = userProfile.bio || '';
    const goal = userProfile.goal || '';

    const buildPrompt = (simplified: boolean) => {
      if (simplified) {
        return `Genera 3 escenarios de entrevista laboral para alguien con estas habilidades: ${skills}. Experiencia: ${experience} años. Responde SOLO con JSON: {"scenarios":[{"id":"1","title":"...","description":"...","difficulty":"medio"}]}`;
      }
      return `Genera 5 escenarios de entrevista laboral personalizados para este perfil profesional.

PERFIL DEL USUARIO:
- Nombre: ${userProfile.fullName || 'Usuario'}
- Titular: ${headline}
- Habilidades: ${skills}
- Años de experiencia: ${experience}
- Biografía: ${bio}
- Objetivo: ${goal}

INSTRUCCIONES:
Genera exactamente 5 escenarios de entrevista en formato JSON.
Cada escenario debe ser relevante para el perfil del usuario.

Responde ÚNICAMENTE con un JSON válido en este formato:
{
  "scenarios": [
    {
      "id": "scenario_1",
      "title": "Título del escenario",
      "description": "Descripción breve del escenario",
      "difficulty": "facil|medio|dificil"
    }
  ]
}

No incluyas texto fuera del JSON.`;
    };

    const parseScenarios = (responseText: string): { id: string; title: string; description: string; difficulty: string }[] => {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No se encontró JSON en la respuesta');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const scenarios = Array.isArray(parsed.scenarios) ? parsed.scenarios : [];

      const validScenarios = scenarios
        .filter((s: any) => {
          if (!s || typeof s !== 'object') return false;
          if (typeof s.id !== 'string' || s.id.trim() === '') return false;
          if (typeof s.title !== 'string' || s.title.trim() === '') return false;
          if (typeof s.description !== 'string' || s.description.trim() === '') return false;
          return true;
        })
        .map((s: any, i: number) => ({
          id: s.id || `scenario_${i + 1}`,
          title: s.title.trim(),
          description: s.description.trim(),
          difficulty: ['facil', 'medio', 'dificil'].includes(s.difficulty) ? s.difficulty : 'medio',
        }));

      if (validScenarios.length === 0) {
        throw new Error('No se generaron escenarios válidos');
      }

      if (validScenarios.length > 10) {
        validScenarios.splice(10);
      }

      const ids = new Set(validScenarios.map((s: any) => s.id));
      if (ids.size !== validScenarios.length) {
        validScenarios.forEach((s: any, i: number) => {
          s.id = `scenario_${i + 1}`;
        });
      }

      return validScenarios;
    };

    const shouldRetryGeneration = (code: string) =>
      code !== 'QUOTA_EXCEEDED' &&
      code !== 'UNAUTHENTICATED' &&
      code !== 'CONFIG_MISSING' &&
      code !== 'ABORTED';

    try {
      const result = await this.generateContent(buildPrompt(false), signal);

      if (!result.ok) {
        if (!shouldRetryGeneration(result.error.code)) {
          return { ok: false, error: result.error };
        }
        throw Object.assign(new Error(result.error.message), { code: result.error.code });
      }

      const scenarios = parseScenarios(result.value);
      return { ok: true, value: scenarios };
    } catch (firstError) {
      const firstCode = typeof firstError === 'object' && firstError !== null && 'code' in firstError
        ? String((firstError as { code: unknown }).code)
        : '';
      console.error('[GeminiService] Primer intento falló:', firstError instanceof Error ? firstError.message : String(firstError));
      if (!shouldRetryGeneration(firstCode)) {
        return {
          ok: false,
          error: {
            message: firstError instanceof Error ? firstError.message : 'Error al generar escenarios',
            code: firstCode || 'GENERATION_ERROR',
            retryable: false,
          },
        };
      }

      try {
        const retryResult = await this.generateContent(buildPrompt(true), signal);

        if (!retryResult.ok) {
          return {
            ok: false,
            error: {
              ...retryResult.error,
              retryable: shouldRetryGeneration(retryResult.error.code) && retryResult.error.retryable,
            },
          };
        }

        const scenarios = parseScenarios(retryResult.value);
        return { ok: true, value: scenarios };
      } catch (retryError) {
        console.error('[GeminiService] Reintento también falló:', retryError instanceof Error ? retryError.message : String(retryError));

        return {
          ok: false,
          error: {
            message: retryError instanceof Error ? retryError.message : 'Error al generar escenarios',
            code: 'GENERATION_ERROR',
            retryable: true,
          },
        };
      }
    }
  }

  /**
   * Obtiene la sesión actual
   */
  getCurrentSession(): SimulationSession | null {
    return this.currentSession;
  }

  /**
   * Finaliza la simulación actual
   */
  endSimulation(): void {
    if (this.currentSession) {
      this.currentSession.status = 'completed';
      this.currentSession.updatedAt = Date.now();
    }
    this.chatHistory = [];
    this.currentSession = null;
    this.isProcessing = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Cancela la operación actual
   */
  cancelCurrentOperation(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isProcessing = false;
  }

  /**
   * Cancela el turno en curso e invalida cualquier respuesta pendiente.
   * Se usa al abandonar el simulador o al interrumpir para responder de nuevo.
   */
  abortCurrentTurn(): void {
    // Incrementar la secuencia hace que cualquier respuesta en vuelo se descarte.
    this.requestSeq += 1;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isProcessing = false;
  }

  /**
   * Verifica si hay una operación en curso
   */
  isBusy(): boolean {
    return this.isProcessing;
  }

  // ==================== MÉTODOS PRIVADOS ====================

  private mapFunctionError(
    status: number,
    result: { error?: { message?: unknown; code?: unknown; retryAfterSeconds?: unknown } } | null,
  ): { message: string; code: string; retryable: boolean } {
    const code = typeof result?.error?.code === 'string' ? result.error.code : 'UNKNOWN_ERROR';
    const retryAfterSeconds = typeof result?.error?.retryAfterSeconds === 'number' ? result.error.retryAfterSeconds : null;
    const isUnauthenticated = code === 'unauthenticated' || code.startsWith('unauthenticated:');
    const mappedCode = code === 'resource-exhausted' ? 'QUOTA_EXCEEDED'
      : isUnauthenticated ? 'UNAUTHENTICATED'
        : code === 'network-error' ? 'NETWORK_ERROR'
          : code === 'configuration-error' ? 'CONFIG_MISSING'
            : code === 'invalid-argument' ? 'INVALID_RESPONSE'
              : code.toUpperCase().replaceAll('-', '_');
    const defaultMessage = mappedCode === 'QUOTA_EXCEEDED'
      ? 'Se agotó la cuota del servicio de IA. Espera o revisa el uso del proyecto.'
      : `Error del servicio de IA (${status}).`;
    let message = typeof result?.error?.message === 'string' ? result.error.message : defaultMessage;
    if (code.startsWith('unauthenticated:')) {
      const diagnostic = code.replace('unauthenticated:', '');
      console.warn(`[GeminiService] Validación de sesión Firebase fallida: ${diagnostic}`);
      if (diagnostic === 'auth/id-token-expired') {
        message = 'Tu sesión de Firebase expiró. Inicia sesión nuevamente con Google para renovarla.';
      } else if (diagnostic === 'auth/argument-error' || diagnostic === 'auth/invalid-id-token') {
        message = 'Tu sesión de Google no coincide con el proyecto de Firebase configurado en el servidor.';
      }
    }
    const retryable = mappedCode !== 'QUOTA_EXCEEDED'
      && mappedCode !== 'UNAUTHENTICATED'
      && mappedCode !== 'CONFIG_MISSING'
      && status >= 500;
    if (mappedCode === 'QUOTA_EXCEEDED' && retryAfterSeconds && retryAfterSeconds > 0 && retryAfterSeconds <= 120) {
      return {
        message: `El servicio de IA pidió esperar ${retryAfterSeconds} segundos antes de reintentar.`,
        code: mappedCode,
        retryable: false,
      };
    }
    return { message, code: mappedCode, retryable };
  }

  private async requestText(
    body: { prompt: string } | { contents: GeminiContent[] },
    signal?: AbortSignal,
  ): Promise<{ ok: true; value: string } | { ok: false; error: { message: string; code: string; retryable: boolean } }> {
    let idToken = await getFirebaseIdToken();
    if (!idToken) {
      return { ok: false, error: { message: 'Inicia sesión para usar la inteligencia artificial.', code: 'UNAUTHENTICATED', retryable: false } };
    }

    const send = async (token: string) => {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      });
      const result = await response.json().catch(() => null) as
        | { ok?: boolean; text?: unknown; usedFallback?: unknown; error?: { message?: unknown; code?: unknown; retryAfterSeconds?: unknown } }
        | null;
      return { response, result };
    };

    let response: Response;
    let result: { ok?: boolean; text?: unknown; usedFallback?: unknown; error?: { message?: unknown; code?: unknown; retryAfterSeconds?: unknown } } | null;
    try {
      ({ response, result } = await send(idToken));
      if (response.status === 401) {
        const refreshed = await getFirebaseIdToken(true);
        if (refreshed) {
          idToken = refreshed;
          ({ response, result } = await send(idToken));
        }
      }
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return {
        ok: false,
        error: aborted
          ? { message: 'Solicitud cancelada.', code: 'ABORTED', retryable: false }
          : { message: 'Se perdió la conexión. Revisa tu red y reintenta.', code: 'NETWORK_ERROR', retryable: true },
      };
    }

    if (!response.ok || !result || result.ok !== true) {
      return { ok: false, error: this.mapFunctionError(response.status, result) };
    }
    if (typeof result.text !== 'string' || !result.text.trim()) {
      return { ok: false, error: { message: 'El servicio de IA devolvió una respuesta vacía.', code: 'EMPTY_RESPONSE', retryable: true } };
    }
    this.usingFallback = result.usedFallback === true;
    return { ok: true, value: result.text };
  }

  private async generateWelcomeMessageWithModel(
    scenario: ScenarioConfig,
    state: ScenarioState,
    interviewer: InterviewerProfile,
  ): Promise<ChatMessage> {
    const prompt = `Inicia la entrevista "${scenario.title}" en primera persona, como ${interviewer.name}.
Saluda, preséntate con tu cargo y formula una sola pregunta inicial breve y profesional.
No narres escenas, no describas acciones y no termines con "¿Qué haces?".
Solo texto plano, diálogo directo.`;

    const systemPrompt = this.buildSystemPrompt(
      scenario,
      { role: 'profesional', experienceLevel: 'intermedio' },
      state,
      interviewer,
    );
    const result = await this.requestText({
      contents: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Entendido.' }] },
        { role: 'user', parts: [{ text: prompt }] },
      ],
    }, this.abortController?.signal);
    if (!result.ok) throw new Error(result.error.message);

    return {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      role: 'model',
      content: result.value,
      timestamp: Date.now(),
      metadata: { scenarioId: scenario.id },
    };
  }

  private buildSystemPrompt(
    scenario: ScenarioConfig,
    userProfile: { role: string; experienceLevel: string },
    state: ScenarioState,
    interviewer: InterviewerProfile = DEFAULT_INTERVIEWER,
  ): string {
    return `ROL
Eres ${interviewer.name}, ${interviewer.gender === 'mujer' ? 'una mujer' : 'un hombre'} y ${interviewer.role.toLowerCase()} de ${interviewer.company}. Conserva esta identidad durante toda la entrevista; no cambies de nombre ni de género.
Tu única función es evaluar competencias mediante una entrevista laboral realista. No eres un asistente, ni un amigo, ni un acompañante emocional.

PERSONALIDAD
- Mantén un estilo ${interviewer.conversationalStyle}.
- Profesional, con criterio objetivo, seriedad y cordialidad.
- Habla con seguridad, usando un lenguaje natural y directo.
- Respetuosa, sin adulación ni entusiasmo exagerado.
- Exigente cuando la situación lo amerite, sin humillar ni agredir.
- Neutral al evaluar: no des por buena una respuesta antes de analizarla.

CÓMO CONVERSAS
- Hablas en primera persona, en español neutro profesional.
- Una sola pregunta principal por turno. Intervenciones de 1 a 3 frases.
- Escuchas la respuesta, detectas lo relevante y adaptas la siguiente pregunta a lo que acaba de decir el candidato.
- Puedes pedir ejemplos concretos, medibles y verificables cuando la respuesta sea vaga.
- Puedes señalar con respeto una inconsistencia profesional y pedir aclaración.
- Si la respuesta es pobre o evasiva, reformulas el escenario para obtener información útil.
- Si el candidato dice que no sabe, ofreces un replanteo concreto del caso.

PROHIBIDO (nunca lo hagas)
- Llamar al candidato "amigo", "parcero", "bro", "mi querido" ni equivalentes.
- Buscar amistad, cercanía emocional o actuar como terapeuta o confidente.
- Frases como "¡Excelente respuesta!", "¡Me encanta!", "Estoy aquí para ti" ni felicitaciones automáticas.
- Entusiasmo o elogios antes de analizar el contenido.
- Conversación social que no aporte a la evaluación.
- Revelar la rúbrica, las respuestas ideales o tu proceso interno de evaluación.
- Narrar acciones, gestos, escenarios o emociones. No escribes acotaciones ni descripciones cinematográficas.
- Escribir listas de preguntas en un mismo mensaje.
- Incluir puntuaciones, barras de recursos, energía, presupuesto, indicadores de juego ni notas técnicas.
- Añadir etiquetas como "Entrevistadora:", encabezados, Markdown, JSON o explicaciones sobre tu papel.

FORMATO DE SALIDA
Únicamente el diálogo directo de la persona entrevistadora, como texto plano.

CONTEXTO DE ESTA ENTREVISTA
PERSONA ENTREVISTADORA: ${interviewer.name}
IDENTIDAD DE GÉNERO: ${interviewer.gender}
CARGO: ${interviewer.role}
ESTILO: ${interviewer.conversationalStyle}
ESCENARIO: ${scenario.title}
DESCRIPCIÓN: ${scenario.description}
PUESTO OBJETIVO: ${scenario.role}
NIVEL DE EXPERIENCIA DEL CANDIDATO: ${userProfile.experienceLevel}
COMPETENCIAS A EXPLORAR: ${state.objectives.join(', ')}

INSTRUCCIÓN DE INICIO: saluda brevemente usando el nombre ${interviewer.name} y presentándote con tu cargo, indica que comenzamos y formula tu primera pregunta. Sin discursos largos.`;
  }

  private buildChaosPrompt(
    event: SimulationEvent
  ): string {
    return `[CAMBIO DE CONTEXTO EN LA ENTREVISTA]

${event.description}

INSTRUCCIONES:
1. Incorpora este cambio como parte natural de la entrevista.
2. Explica el nuevo matiz en una o dos frases, en primera persona.
3. Formula una sola pregunta relacionada.
4. No menciones "evento", "caos" ni mecánicas de juego.
5. Mantén el tono profesional.`;
  }

  private generateChaosEvent(session: SimulationSession): SimulationEvent | null {
    const templates = this.getChaosTemplates(session.scenarioId);
    const template = this.selectWeightedTemplate(templates);

    // Validación explícita: nunca accedemos a `template` sin comprobar que existe.
    // Los escenarios dinámicos (generados por IA) no coinciden con `compatibleScenarios`,
    // por lo que las plantillas universales garantizan que aquí siempre haya plantilla.
    if (!template) {
      console.error('[GeminiService] Sin plantilla de Modo Caos para el escenario:', session.scenarioId);
      return null;
    }

    const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    return {
      id: eventId,
      type: template.type,
      title: template.title,
      description: template.description,
      createdAt: Date.now(),
      scenarioChanges: template.scenarioChanges,
      status: 'pending',
    };
  }

  private getChaosTemplates(scenarioId: string): ChaosTemplate[] {
    const commonTemplates: ChaosTemplate[] = [
      {
        type: 'resource_constraint',
        title: 'Recorte presupuestario inesperado',
        description: 'La dirección informa un recorte del 30% en el presupuesto asignado.',
        scenarioChanges: { resources: { tiempo: 100, presupuesto: 70, energia: 100, redContactos: 100 } },
        weight: 15,
        compatibleScenarios: ['lanzamiento_producto', 'gestion_crisis', 'liderazgo_equipo'],
      },
      {
        type: 'priority_shift',
        title: 'Cambio de prioridad directivo',
        description: 'La alta dirección reasigna prioridades: tu proyecto pasa a segundo plano.',
        scenarioChanges: { constraints: ['Reasignación de prioridades por dirección'] },
        weight: 12,
        compatibleScenarios: ['lanzamiento_producto', 'gestion_crisis', 'liderazgo_equipo', 'cambio_carrera'],
      },
      {
        type: 'new_information',
        title: 'Fuga de información competitiva',
        description: 'Un competidor anuncia un producto similar con lanzamiento inminente.',
        scenarioChanges: { constraints: ['Competidor con ventaja temporal'], currentSituation: 'Un competidor anuncia lanzamiento similar en 2 semanas' },
        weight: 10,
        compatibleScenarios: ['lanzamiento_producto', 'negociacion_salarial', 'presentacion_inversion'],
      },
      {
        type: 'external_event',
        title: 'Crisis macroeconómica repentina',
        description: 'Anuncio de recesión técnica afecta financiación y planes de contratación.',
        scenarioChanges: { resources: { tiempo: 80, presupuesto: 60, energia: 100, redContactos: 100 }, constraints: ['Entorno macroeconómico adverso'] },
        weight: 8,
        compatibleScenarios: ['lanzamiento_producto', 'presentacion_inversion', 'cambio_carrera'],
      },
      {
        type: 'opportunity',
        title: 'Contacto clave inesperado',
        description: 'Un antiguo colega ofrece presentar a un inversor/clave decisor.',
        scenarioChanges: { resources: { tiempo: 100, presupuesto: 100, energia: 100, redContactos: 100 }, constraints: ['Nueva oportunidad de conexión estratégica'] },
        weight: 12,
        compatibleScenarios: ['presentacion_inversion', 'networking_evento', 'cambio_carrera'],
      },
      {
        type: 'crisis',
        title: 'Baja crítica del equipo',
        description: 'Tu perfil técnico clave anuncia su renuncia inmediata.',
        scenarioChanges: { resources: { tiempo: 70, presupuesto: 100, energia: 50, redContactos: 100 }, constraints: ['Pérdida de talento clave'] },
        weight: 10,
        compatibleScenarios: ['lanzamiento_producto', 'liderazgo_equipo', 'gestion_crisis'],
      },
      {
        type: 'breakthrough',
        title: 'Descubrimiento técnico fortuito',
        description: 'Durante pruebas surge una solución innovadora que reduce coste/tiempo 40%.',
        scenarioChanges: { resources: { tiempo: 130, presupuesto: 120, energia: 100, redContactos: 100 }, currentSituation: 'Descubrimiento interno reduce costes y plazos significativamente' },
        weight: 8,
        compatibleScenarios: ['lanzamiento_producto', 'gestion_crisis', 'presentacion_inversion'],
      },
    ];

    const specific = commonTemplates.filter((template) => template.compatibleScenarios.includes(scenarioId));
    if (specific.length > 0) return specific;

    // Fallback obligatorio: escenarios dinámicos (id generado por IA) no coinciden
    // con las listas anteriores. Devolvemos plantillas universales para no quedar sin evento.
    return this.getUniversalChaosTemplates();
  }

  /**
   * Plantillas aplicables a CUALQUIER escenario, incluidas las entrevistas
   * generadas dinámicamente. Evitan el fallo "template is undefined".
   */
  private getUniversalChaosTemplates(): ChaosTemplate[] {
    return [
      {
        type: 'new_information',
        title: 'Requisito nuevo del puesto',
        description: 'La persona entrevistadora menciona un requisito que no aparecía en la descripción inicial del puesto.',
        scenarioChanges: { constraints: ['Requisito adicional no previsto en la vacante'] },
        weight: 16,
        compatibleScenarios: [],
      },
      {
        type: 'priority_shift',
        title: 'Cambio de enfoque de la entrevista',
        description: 'La entrevistadora decide profundizar en un área distinta a la que estabas desarrollando.',
        scenarioChanges: { currentSituation: 'La entrevista cambia de foco hacia otra competencia' },
        weight: 15,
        compatibleScenarios: [],
      },
      {
        type: 'crisis',
        title: 'Pregunta de presión',
        description: 'Te plantean un caso límite y esperan una respuesta concreta en muy poco tiempo.',
        scenarioChanges: { resources: { tiempo: 70, presupuesto: 100, energia: 80, redContactos: 100 } },
        weight: 14,
        compatibleScenarios: [],
      },
      {
        type: 'new_information',
        title: 'Dato contradictorio en tu relato',
        description: 'La entrevistadora señala una posible contradicción entre dos respuestas anteriores.',
        scenarioChanges: { currentSituation: 'Debes aclarar una aparente contradicción en tus respuestas' },
        weight: 13,
        compatibleScenarios: [],
      },
      {
        type: 'opportunity',
        title: 'Pregunta que te favorece',
        description: 'Aparece una pregunta que conecta directamente con uno de tus puntos fuertes.',
        scenarioChanges: { constraints: [] },
        weight: 12,
        compatibleScenarios: [],
      },
      {
        type: 'external_event',
        title: 'Interrupción imprevista',
        description: 'La entrevista se interrumpe brevemente y debes retomar el hilo al volver.',
        scenarioChanges: { currentSituation: 'La entrevista se reanuda tras una breve interrupción' },
        weight: 10,
        compatibleScenarios: [],
      },
      {
        type: 'breakthrough',
        title: 'Ejemplo concreto requerido',
        description: 'Te piden un ejemplo medible y verificable de un resultado que hayas conseguido.',
        scenarioChanges: { constraints: ['Se exige evidencia concreta de resultados'] },
        weight: 10,
        compatibleScenarios: [],
      },
    ];
  }

  private selectWeightedTemplate(templates: ChaosTemplate[]): ChaosTemplate | null {
    if (templates.length === 0) return null;

    const totalWeight = templates.reduce((sum, template) => sum + template.weight, 0);
    if (totalWeight <= 0) return null;

    let random = Math.random() * totalWeight;

    for (const template of templates) {
      random -= template.weight;
      if (random <= 0) return template;
    }

    return templates[0] ?? null;
  }

  private extractScenarioState(response: string, currentState: ScenarioState): ScenarioState {
    const newState = { ...currentState };

    const resourcePatterns = {
      tiempo: /tiempo\D*(\d{1,3})%?/gi,
      presupuesto: /presupuesto\D*(\d{1,3})%?/gi,
      energia: /energ[ií]a\D*(\d{1,3})%?/gi,
      redContactos: /(contactos?|red)\D*(\d{1,3})%?/gi,
    };

    for (const [resource, pattern] of Object.entries(resourcePatterns)) {
      const matches = [...response.matchAll(pattern)];
      if (matches.length > 0) {
        const lastMatch = matches[matches.length - 1];
        const value = parseInt(lastMatch[1] || lastMatch[2] || '0', 10);
        if (!isNaN(value) && value > 0 && value <= 200) {
          (newState.resources as any)[resource] = Math.max(0, Math.min(200, value));
        }
      }
    }

    const progressMatch = response.match(/progreso\D*(\d{1,3})%?/gi);
    if (progressMatch) {
      const value = parseInt(progressMatch[progressMatch.length - 1].replace(/\D/g, ''), 10);
      if (!isNaN(value)) newState.progress = Math.max(0, Math.min(100, value));
    }

    return newState;
  }

  /**
   * Clasifica errores del proveedor para distinguir transitorios (reintentables)
   * de permanentes (no reintentar).
   */
  private mapGeminiError(error: unknown): { message: string; code: string; retryable: boolean } {
    const raw = error instanceof Error ? error.message : String(error);
    const message = raw.toLowerCase();

    // Permanentes: no reintentar
    if (message.includes('api key') || message.includes('api_key') || message.includes('permission denied')) {
      return { message: 'La credencial del servicio de IA no es válida. Revisa la configuración.', code: 'API_KEY_INVALID', retryable: false };
    }
    if (message.includes('not found') && message.includes('model')) {
      return { message: 'El modelo configurado no está disponible.', code: 'MODEL_UNAVAILABLE', retryable: false };
    }
    if (message.includes('invalid') && message.includes('argument')) {
      return { message: 'La solicitud al servicio de IA no es válida.', code: 'INVALID_REQUEST', retryable: false };
    }
    if (message.includes('too long') || message.includes('context length')) {
      return { message: 'El contexto de la entrevista es demasiado largo.', code: 'CONTEXT_TOO_LONG', retryable: false };
    }

    // Transitorios: sí reintentar
    if (message.includes('quota') || message.includes('resource_exhausted') || message.includes('agotó la cuota') || message.includes('429')) {
      return { message: 'Se agotó la cuota del servicio de IA. Espera o revisa el uso del proyecto; no reintentaremos automáticamente.', code: 'QUOTA_EXCEEDED', retryable: false };
    }
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return { message: 'Demasiadas solicitudes seguidas. Reintentando…', code: 'RATE_LIMIT_EXCEEDED', retryable: true };
    }
    if (message.includes('overloaded') || message.includes('unavailable') || message.includes('503')) {
      return { message: 'El servicio de IA está saturado temporalmente. Reintentando…', code: 'SERVICE_UNAVAILABLE', retryable: true };
    }
    if (message.includes('deadline') || message.includes('timeout') || message.includes('timed out')) {
      return { message: 'El servicio de IA tardó demasiado. Puedes reintentar.', code: 'TIMEOUT', retryable: true };
    }
    if (message.includes('network') || message.includes('fetch') || message.includes('connection') || message.includes('offline')) {
      return { message: 'Se perdió la conexión. Revisa tu red y reintenta.', code: 'NETWORK_ERROR', retryable: true };
    }

    return { message: 'Error al comunicarse con el servicio de IA. Puedes reintentar.', code: 'UNKNOWN_ERROR', retryable: true };
  }

  /** Marca de tiempo para diagnóstico de latencia (solo en desarrollo). */
  private latencyMark(label: string, startMs: number): void {
    if (import.meta.env.DEV) {
      const elapsed = Math.round(performance.now() - startMs);
      console.debug(`[latencia] ${label}: ${elapsed} ms`);
    }
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Instancia singleton
export const geminiService = new GeminiService();

/**
 * Hook para usar el servicio en componentes React
 */
export function useGeminiService() {
  return geminiService;
}