import type {
  ChatMessage,
  SimulationEvent,
  ScenarioState,
  ScenarioConfig,
  SimulationSession,
  GeminiConfig,
  AIServiceFailure,
} from '@/types/ai';
import { DEFAULT_GEMINI_CONFIG } from '@/types/ai';
import { getFirebaseIdToken } from '@/services/firebase/idToken';
import { DEFAULT_INTERVIEWER, type InterviewerProfile } from '@/services/ai/interviewers';
import { SCENARIOS } from '@/services/ai/scenarios';

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

import { parseScenariosResponse } from '@/services/ai/scenarioParser';
import { generateLocalWelcomeMessage, generateLocalCandidateNameTurn, generateLocalChaosTurn, generateLocalFollowUpTurn } from '@/services/ai/localInterviewFallback';
import { classifyTransportError, normalizeGeminiFunctionError } from '@/services/ai/errorClassification';
export { parseScenariosResponse };

const PRIMARY_MODEL = 'gemini-3.5-flash';
type AiOperationType = 'scenarios' | 'welcome' | 'turn' | 'chaos' | 'evaluation' | 'content';

/**
 * Servicio centralizado de Inteligencia Artificial con Gemini
 * Maneja conversaciones, simulaciones y Modo Caos
 * Usa una solicitud al servidor por operación y respaldo conversacional local en fallos.
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
  private operationSeq = 0;
  private usingFallback = false;
  private localTurnIndex = 0;
  private localAskedQuestions = new Set<number>();
  private localizeAbortedTurn = false;
  private currentCandidateProfile: { fullName?: string; headline?: string; bio?: string; goal?: string; skills?: string[]; yearsOfExperience?: number; education?: string } = {};
  private fallbackReason: string | null = null;

  /**
   * Prepara el cliente local; las credenciales y la configuración del modelo viven en el servidor.
   */
  initialize(config?: Partial<GeminiConfig>): { ok: true; value: void } | { ok: false; error: AIServiceFailure & { originalError?: Error } } {
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
      console.error('[GeminiService] initialize failed (CONFIGURATION_ERROR).');
      return {
        ok: false,
        error: {
          message: 'Error al inicializar el cliente de Gemini',
          code: 'CONFIG_MISSING',
          retryable: false,
          category: 'CONFIGURATION_ERROR',
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

  getFallbackReason(): string | null { return this.fallbackReason; }

  /**
   * Genera contenido mediante la función autenticada del servidor.
   */
  async generateContent(prompt: string, signal?: AbortSignal, operationType: AiOperationType = 'content'): Promise<{ ok: true; value: string } | { ok: false; error: AIServiceFailure }> {
    if (!this.isConfigured()) {
      return { ok: false, error: { message: 'Servicio Gemini no inicializado', code: 'CONFIG_MISSING', retryable: false, category: 'CONFIGURATION_ERROR' } };
    }

    return this.requestText({ prompt }, signal, operationType);
  }

  /**
   * Inicia una nueva sesión de simulación con estrategia de fallback
   */
  async startSimulation(
    scenarioConfig: ScenarioConfig,
    userProfile: { role: string; experienceLevel: string; fullName?: string; headline?: string; bio?: string; goal?: string; skills?: string[]; yearsOfExperience?: number; education?: string },
    interviewer: InterviewerProfile = DEFAULT_INTERVIEWER,
    localOnly = false,
    localFallbackReason = 'Escenario predefinido',
  ): Promise<{ ok: true; value: SimulationSession } | { ok: false; error: AIServiceFailure }> {
    if (this.isProcessing) {
      return { ok: false, error: { message: 'Ya hay una operación en curso', code: 'UNKNOWN_ERROR', retryable: true } };
    }

    this.isProcessing = true;
    const operationId = ++this.operationSeq;
    this.abortController = new AbortController();

    try {
      const sessionId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const initialState = { ...scenarioConfig.initialState };

      this.currentSession = {
        id: sessionId,
        scenarioId: scenarioConfig.id,
        candidateName: userProfile.fullName?.trim() || undefined,
        status: 'active',
        scenarioState: initialState,
        messages: [],
        events: [],
        chaosAvailable: true,
        chaosCooldown: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.lastChaosTrigger = 0;
      this.localTurnIndex = 0;
      this.localAskedQuestions = new Set<number>();
      this.currentCandidateProfile = userProfile;
      this.usingFallback = localOnly;
      this.fallbackReason = localOnly ? localFallbackReason : null;
      this.localizeAbortedTurn = false;

      const systemPrompt = this.buildSystemPrompt(
        scenarioConfig,
        { ...userProfile, candidateName: userProfile.fullName?.trim() || undefined },
        initialState,
        interviewer,
      );
      this.chatHistory = [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Entendido. Iniciemos la simulación.' }] },
      ];

      const welcomeStartedAt = performance.now();
      try {
        if (this.usingFallback) throw new Error('LOCAL_SCENARIO');
        const welcomeMessage = await this.generateWelcomeMessageWithModel(scenarioConfig, initialState, interviewer, userProfile);
        if (this.operationSeq !== operationId || this.currentSession?.id !== sessionId) {
          return { ok: false, error: { message: 'La entrevista se cerró antes de completar el inicio.', code: 'ABORTED', retryable: false } };
        }
        this.currentSession.messages.push(welcomeMessage);
        this.usingFallback = false;
        this.latencyMark('bienvenida Gemini', welcomeStartedAt, 'ok');
        return { ok: true, value: this.currentSession };
      } catch (welcomeError) {
        if (this.operationSeq !== operationId || this.currentSession?.id !== sessionId) {
          return { ok: false, error: { message: 'La entrevista se cerró antes de completar el inicio.', code: 'ABORTED', retryable: false } };
        }
        const classified = this.mapGeminiError(welcomeError);
        const localModeSelected = this.fallbackReason === 'LOCAL_FALLBACK_SELECTED'
          && classified.category === 'CANCELLED';
        const fallbackCode = localModeSelected ? 'LOCAL_FALLBACK_SELECTED' : classified.code;
        if (!localOnly) this.fallbackReason = fallbackCode;
        if (!localOnly && !localModeSelected) console.warn('[GeminiService] No se pudo generar bienvenida con Gemini (' + classified.code + '). Activando fallback local sin bloquear la entrevista.');
        const localWelcome = generateLocalWelcomeMessage(scenarioConfig, interviewer, userProfile.fullName);
        this.currentSession.messages.push(localWelcome);
        this.usingFallback = true;
        this.latencyMark('bienvenida local', welcomeStartedAt, 'local');
        return { ok: true, value: this.currentSession };
      }
    } catch (error) {
      if (this.operationSeq === operationId) {
        this.currentSession = null;
        this.chatHistory = [];
      }
      const classified = this.mapGeminiError(error);
      console.error('[GeminiService] startSimulation failed.', { category: classified.category ?? 'UNKNOWN_ERROR', code: classified.code });
      return { ok: false, error: classified };
    } finally {
      if (this.operationSeq === operationId) this.isProcessing = false;
    }
  }

  /**
   * Inicia una simulación con un escenario dinámico generado por IA
   */
  async startDynamicSimulation(
    dynamicScenario: { id: string; title: string; description: string; difficulty: string; fallbackReason?: string },
    userProfile: { role: string; experienceLevel: string; fullName?: string; headline?: string; bio?: string; goal?: string; skills?: string[]; yearsOfExperience?: number; education?: string },
    interviewer: InterviewerProfile = DEFAULT_INTERVIEWER,
  ): Promise<{ ok: true; value: SimulationSession } | { ok: false; error: AIServiceFailure }> {
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

    return this.startSimulation(
      scenarioConfig,
      userProfile,
      interviewer,
      Boolean((dynamicScenario as { isFallback?: boolean }).isFallback),
      dynamicScenario.fallbackReason || 'Escenario predefinido',
    );
  }

  /**
   * Envía un mensaje del usuario y obtiene respuesta
   */
  async sendMessage(content: string): Promise<{ ok: true; value: { message: ChatMessage; events: never[]; scenarioState: ScenarioState } } | { ok: false; error: AIServiceFailure }> {
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
    const operationId = ++this.operationSeq;
    this.abortController = new AbortController();
    const sessionAtStart = this.currentSession;

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

    const isCandidateNameAnswer = !this.currentSession.candidateName && this.currentSession.messages.length === 1;
    if (isCandidateNameAnswer) {
      const candidateName = content.trim().replace(/\s+/g, ' ').slice(0, 80);
      userMessage.metadata = { isCandidateName: true };
      this.currentSession.candidateName = candidateName;
      this.currentCandidateProfile = { ...this.currentCandidateProfile, fullName: candidateName };
      this.currentSession.messages.push(userMessage);
      const nameTurn = generateLocalCandidateNameTurn(candidateName);
      this.currentSession.messages.push(nameTurn);
      this.chatHistory.push(
        { role: 'user', parts: [{ text: `La persona candidata se llama ${candidateName}. Este es el nombre del candidato, no el de la persona entrevistadora.` }] },
        { role: 'model', parts: [{ text: nameTurn.content }] },
      );
      this.currentSession.updatedAt = Date.now();
      this.isProcessing = false;
      return { ok: true, value: { message: nameTurn, events: [], scenarioState: this.currentSession.scenarioState } };
    }

    // El mensaje del usuario se añade UNA sola vez, fuera del bucle de reintentos.
    this.currentSession.messages.push(userMessage);
    this.latencyMark('turno preparado', turnStart);

    try {
      if (this.usingFallback) {
        const localFollowUpStartedAt = performance.now();
        const localTurn = generateLocalFollowUpTurn(content, this.localTurnIndex++, this.currentSession.scenarioState, this.localAskedQuestions);
        this.currentSession.messages.push(localTurn.message);
        this.currentSession.scenarioState = localTurn.scenarioState;
        if (localTurn.completed) this.currentSession.status = 'completed';
        this.currentSession.updatedAt = Date.now();
        this.chatHistory.push({ role: 'user', parts: [{ text: content.trim() }] }, { role: 'model', parts: [{ text: localTurn.message.content }] });
        this.latencyMark('seguimiento local', localFollowUpStartedAt, 'local');
        return { ok: true, value: { message: localTurn.message, events: [], scenarioState: localTurn.scenarioState } };
      }

      const modelStart = performance.now();
          const userTurn: GeminiContent = { role: 'user', parts: [{ text: content.trim() }] };
          const result = await this.requestText(
            { contents: [...this.chatHistory, userTurn] },
            this.abortController?.signal,
            'turn',
          );
          if (this.operationSeq !== operationId || this.currentSession !== sessionAtStart) {
            return { ok: false, error: { message: 'La sesión terminó antes de completar la respuesta.', code: 'ABORTED', retryable: false } };
          }
          if (this.localizeAbortedTurn && this.currentSession) {
            this.localizeAbortedTurn = false;
            this.usingFallback = true;
            this.fallbackReason = 'INTERRUPTED_LOCAL';
            const localTurn = generateLocalFollowUpTurn(content, this.localTurnIndex++, this.currentSession.scenarioState, this.localAskedQuestions);
            this.currentSession.messages.push(localTurn.message);
            this.currentSession.scenarioState = localTurn.scenarioState;
            if (localTurn.completed) this.currentSession.status = 'completed';
            this.currentSession.updatedAt = Date.now();
            this.chatHistory.push(userTurn, { role: 'model', parts: [{ text: localTurn.message.content }] });
            this.latencyMark('seguimiento local por interrupción', turnStart, 'local');
            return { ok: true, value: { message: localTurn.message, events: [], scenarioState: localTurn.scenarioState } };
          }
          if (!result.ok) {
            if (result.error.code === 'ABORTED') return { ok: false, error: result.error };
            this.usingFallback = true;
            this.fallbackReason = result.error.code;
            const localTurn = generateLocalFollowUpTurn(content, this.localTurnIndex++, this.currentSession.scenarioState, this.localAskedQuestions);
            this.currentSession.messages.push(localTurn.message);
            this.currentSession.scenarioState = localTurn.scenarioState;
            if (localTurn.completed) this.currentSession.status = 'completed';
            this.currentSession.updatedAt = Date.now();
            this.chatHistory.push(userTurn, { role: 'model', parts: [{ text: localTurn.message.content }] });
            this.latencyMark('seguimiento local tras error', turnStart, result.error.code);
            return { ok: true, value: { message: localTurn.message, events: [], scenarioState: localTurn.scenarioState } };
          }
          const responseText = result.value;
          this.latencyMark('respuesta de Gemini', modelStart);
          this.latencyMark('turno completo (usuario → texto de respuesta)', turnStart);

          if (!responseText || !responseText.trim()) {
            this.usingFallback = true;
            this.fallbackReason = 'INVALID_RESPONSE';
            const localTurn = generateLocalFollowUpTurn(content, this.localTurnIndex++, this.currentSession.scenarioState, this.localAskedQuestions);
            this.currentSession.messages.push(localTurn.message);
            this.currentSession.scenarioState = localTurn.scenarioState;
            if (localTurn.completed) this.currentSession.status = 'completed';
            this.latencyMark('seguimiento local tras respuesta vacía', turnStart, 'INVALID_RESPONSE');
            return { ok: true, value: { message: localTurn.message, events: [], scenarioState: localTurn.scenarioState } };
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
          if (this.operationSeq !== operationId || this.currentSession !== sessionAtStart) {
            return { ok: false, error: { message: 'La sesión terminó antes de completar la respuesta.', code: 'ABORTED', retryable: false } };
          }
          if (attemptError instanceof Error && attemptError.name === 'AbortError') {
            if (this.localizeAbortedTurn && this.currentSession) {
              this.localizeAbortedTurn = false;
              this.usingFallback = true;
              this.fallbackReason = 'INTERRUPTED_LOCAL';
              const localTurn = generateLocalFollowUpTurn(content, this.localTurnIndex++, this.currentSession.scenarioState, this.localAskedQuestions);
              this.currentSession.messages.push(localTurn.message);
              this.currentSession.scenarioState = localTurn.scenarioState;
              if (localTurn.completed) this.currentSession.status = 'completed';
              this.currentSession.updatedAt = Date.now();
              const userTurn: GeminiContent = { role: 'user', parts: [{ text: content.trim() }] };
              this.chatHistory.push(userTurn, { role: 'model', parts: [{ text: localTurn.message.content }] });
              this.latencyMark('seguimiento local por interrupción', turnStart, 'local');
              return { ok: true, value: { message: localTurn.message, events: [], scenarioState: localTurn.scenarioState } };
            }
            return { ok: false, error: { message: 'Solicitud cancelada.', code: 'ABORTED', retryable: false } };
          }
          const classified = this.mapGeminiError(attemptError);
          if (classified.code !== 'ABORTED') {
            this.usingFallback = true;
            this.fallbackReason = classified.code;
            const localTurn = generateLocalFollowUpTurn(content, this.localTurnIndex++, this.currentSession.scenarioState, this.localAskedQuestions);
            this.currentSession.messages.push(localTurn.message);
            this.currentSession.scenarioState = localTurn.scenarioState;
            if (localTurn.completed) this.currentSession.status = 'completed';
            this.latencyMark('seguimiento local tras error', turnStart, classified.code);
            return { ok: true, value: { message: localTurn.message, events: [], scenarioState: localTurn.scenarioState } };
          }
          return { ok: false, error: classified };
    }
    finally {
      // Solo liberamos el flag si este sigue siendo el turno actual.
      if (seq === this.requestSeq && this.operationSeq === operationId) this.isProcessing = false;
    }
  }

  /**
   * Activa Modo Caos - introduce un evento inesperado
   */
  async triggerChaos(): Promise<{ ok: true; value: { event: SimulationEvent; response: ChatMessage; scenarioState: ScenarioState } } | { ok: false; error: AIServiceFailure }> {
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
    const operationId = ++this.operationSeq;
    this.abortController = new AbortController();
    const sessionAtStart = this.currentSession;
    const startedAt = performance.now();

    try {
      const chaosEvent = this.generateChaosEvent(this.currentSession!);
      if (!chaosEvent) {
        // No simulamos éxito: informamos y dejamos la simulación como estaba.
        return {
          ok: false,
          error: {
            message: 'No hay un evento inesperado disponible para este escenario. Inténtalo de nuevo en unos segundos.',
            code: 'CHAOS_NO_TEMPLATE',
            retryable: true,
          },
        };
      }

      let responseText: string;
      let updatedState: ScenarioState;
      let chaosResponse: ChatMessage;
      if (this.usingFallback) {
        const localTurn = generateLocalChaosTurn(chaosEvent, this.currentSession!.scenarioState);
        responseText = localTurn.message.content;
        updatedState = localTurn.scenarioState;
        chaosResponse = localTurn.message;
        const localChaosPrompt = this.buildChaosPrompt(chaosEvent);
        this.chatHistory.push(
          { role: 'user', parts: [{ text: localChaosPrompt }] },
          { role: 'model', parts: [{ text: responseText }] },
        );
        this.latencyMark('imprevisto local', startedAt, 'local');
      } else {
        const chaosPrompt = this.buildChaosPrompt(chaosEvent);
        const chaosTurn: GeminiContent = { role: 'user', parts: [{ text: chaosPrompt }] };
        const result = await this.requestText(
          { contents: [...this.chatHistory, chaosTurn] },
          this.abortController?.signal,
          'chaos',
        );
        if (this.operationSeq !== operationId || this.currentSession !== sessionAtStart) {
          return { ok: false, error: { message: 'La sesión terminó antes de completar el imprevisto.', code: 'ABORTED', retryable: false } };
        }
        if (!result.ok) {
          if (result.error.code === 'ABORTED') {
            this.currentSession!.status = 'active';
            return { ok: false, error: result.error };
          }
          this.usingFallback = true;
          this.fallbackReason = result.error.code;
          const localTurn = generateLocalChaosTurn(chaosEvent, this.currentSession!.scenarioState);
          responseText = localTurn.message.content;
          updatedState = localTurn.scenarioState;
          chaosResponse = localTurn.message;
          this.chatHistory.push(chaosTurn, { role: 'model', parts: [{ text: responseText }] });
          this.latencyMark('imprevisto con respaldo local', startedAt, result.error.code);
        } else {
          responseText = result.value;
          updatedState = this.extractScenarioState(responseText, this.currentSession!.scenarioState);
          chaosResponse = {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            role: 'model',
            content: responseText,
            timestamp: Date.now(),
            metadata: { eventId: chaosEvent.id },
          };
          this.chatHistory.push(chaosTurn, { role: 'model', parts: [{ text: responseText }] });
          this.latencyMark('imprevisto Gemini', startedAt, 'ok');
        }
      }

      this.currentSession!.events.push(chaosEvent);
      this.currentSession!.messages.push(chaosResponse);
      chaosEvent.scenarioChanges = { ...updatedState };
      chaosEvent.status = 'active';
      chaosEvent.relatedMessageId = chaosResponse.id;

      this.currentSession!.scenarioState = updatedState;
      this.currentSession!.status = 'active';
      this.currentSession!.updatedAt = Date.now();
      this.lastChaosTrigger = now;

      return { ok: true, value: { event: chaosEvent, response: chaosResponse, scenarioState: updatedState } };
    } catch (error) {
      const classified = this.mapGeminiError(error);
      if (this.currentSession === sessionAtStart) this.currentSession.status = 'active';
      console.error('[GeminiService] triggerChaos failed:', classified.code);
      this.latencyMark('imprevisto fallido', startedAt, classified.code);
      return { ok: false, error: classified };
    } finally {
      if (this.operationSeq === operationId) this.isProcessing = false;
    }
  }

  /**
   * Genera escenarios de entrevista dinámicos basados en el perfil del usuario
   * Intenta Gemini una vez y devuelve escenarios predefinidos ante cualquier fallo recuperable.
   */
  async generateScenariosFromProfile(
    userProfile: { fullName?: string; skills?: string[]; yearsOfExperience?: number; headline?: string; bio?: string; goal?: string; education?: string },
    signal?: AbortSignal,
  ): Promise<{ ok: true; value: { id: string; title: string; description: string; difficulty: string; isFallback?: boolean }[] } | { ok: false; error: AIServiceFailure }> {
    const scenarioStartedAt = performance.now();
    const localScenarios = (fallbackReason = 'Escenario predefinido') => Object.values(SCENARIOS).slice(0, 5).map((cfg) => ({ id: cfg.id, title: cfg.title, description: cfg.description, difficulty: 'medio', isFallback: true, fallbackReason }));
    const hasProfessionalContext = Boolean(
      userProfile.headline?.trim() || userProfile.skills?.some((skill) => skill.trim()) ||
      userProfile.bio?.trim() || userProfile.goal?.trim() || userProfile.education?.trim() ||
      (typeof userProfile.yearsOfExperience === 'number' && userProfile.yearsOfExperience > 0),
    );
    if (!hasProfessionalContext) {
      this.latencyMark('escenarios predefinidos', scenarioStartedAt, 'NO_PROFILE_CONTEXT');
      return { ok: true, value: localScenarios('Perfil sin datos profesionales suficientes') };
    }
    if (!this.isConfigured()) {
      this.latencyMark('escenarios predefinidos', scenarioStartedAt, 'CONFIG_MISSING');
      return { ok: true, value: localScenarios('CONFIG_MISSING') };
    }

    const skills = userProfile.skills?.join(', ') || 'No especificadas';
    const experience = userProfile.yearsOfExperience || 0;
    const headline = userProfile.headline || 'Profesional';
    const bio = userProfile.bio || '';
    const goal = userProfile.goal || '';
    const education = userProfile.education || '';

    const buildPrompt = () => {
      return `Genera 5 escenarios de entrevista laboral personalizados para este perfil profesional.

PERFIL DEL USUARIO:
- Nombre: ${userProfile.fullName || 'Usuario'}
- Titular: ${headline}
- Habilidades: ${skills}
- Años de experiencia: ${experience}
- Estudios: ${education || 'No especificados'}
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

    const getFallbackScenarios = (fallbackReason = 'Escenario predefinido'): { id: string; title: string; description: string; difficulty: string; isFallback?: boolean; fallbackReason?: string }[] => {
      return Object.values(SCENARIOS).slice(0, 5).map((cfg) => ({
        id: cfg.id,
        title: cfg.title,
        description: cfg.description,
        difficulty: cfg.initialState.constraints.some((c) => c.toLowerCase().includes('dificil'))
          ? 'dificil'
          : cfg.initialState.constraints.some((c) => c.toLowerCase().includes('facil'))
            ? 'facil'
            : 'medio',
        isFallback: true,
        fallbackReason,
      }));
    };

    try {
      const result = await this.generateContent(buildPrompt(), signal, 'scenarios');
      this.latencyMark('generación de escenarios', scenarioStartedAt, result.ok ? 'ok' : result.error.code);

      if (!result.ok) {
        if (result.error.code === 'ABORTED') return { ok: false, error: result.error };
        // Cualquier indisponibilidad o respuesta inválida debe permitir practicar localmente;
        // el motivo real queda asociado a cada escenario y no se disfraza como cuota agotada.
        this.latencyMark('escenarios predefinidos', scenarioStartedAt, result.error.code);
        return { ok: true, value: localScenarios(result.error.code) };
      }

      const scenarios = parseScenariosResponse(result.value);
      return { ok: true, value: scenarios };
    } catch (firstError) {
      const firstCode = typeof firstError === 'object' && firstError !== null && 'code' in firstError
        ? String((firstError as { code: unknown }).code)
        : '';
      if (firstCode === 'ABORTED') {
        return { ok: false, error: { message: 'Generación de escenarios cancelada.', code: firstCode, retryable: false } };
      }
      if (firstCode === 'UNAUTHENTICATED' || firstCode === 'PERMISSION_DENIED') {
        return { ok: true, value: localScenarios(firstCode) };
      }
      console.warn('[GeminiService] Respuesta de escenarios no válida; se mostrarán escenarios predefinidos.');
      this.latencyMark('generación de escenarios local', scenarioStartedAt, firstCode || 'INVALID_RESPONSE');
      return { ok: true, value: getFallbackScenarios(firstCode || 'INVALID_RESPONSE') };
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
    this.operationSeq += 1;
    this.requestSeq += 1;
    if (this.currentSession) {
      this.currentSession.status = 'completed';
      this.currentSession.updatedAt = Date.now();
    }
    this.chatHistory = [];
    this.currentSession = null;
    this.localTurnIndex = 0;
    this.localAskedQuestions = new Set<number>();
    this.localizeAbortedTurn = false;
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
    this.localizeAbortedTurn = false;
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

  /** Cancela la llamada del turno y devuelve una continuación local para la respuesta ya recibida. */
  interruptCurrentTurnLocally(): boolean {
    if (!this.currentSession || !this.isProcessing || this.currentSession.status !== 'active') return false;
    this.localizeAbortedTurn = true;
    this.usingFallback = true;
    this.fallbackReason = 'INTERRUPTED_LOCAL';
    this.abortController?.abort();
    return true;
  }

  /** Aborta la bienvenida en curso a petición del usuario y continúa con la bienvenida local. */
  continueWithLocalFallback(): boolean {
    if (!this.currentSession || !this.isProcessing) return false;
    this.usingFallback = true;
    this.fallbackReason = 'LOCAL_FALLBACK_SELECTED';
    this.abortController?.abort();
    return true;
  }

  // ==================== MÉTODOS PRIVADOS ====================

  private mapFunctionError(
    status: number,
    result: { ok?: unknown; error?: { message?: unknown; code?: unknown; category?: unknown; retryAfterSeconds?: unknown; sourceCode?: unknown; sourceStatus?: unknown } } | null,
  ): AIServiceFailure {
    const normalized = normalizeGeminiFunctionError(status, result);
    const firebaseAuthCode = typeof result?.error?.code === 'string' && result.error.code.startsWith('unauthenticated:')
      ? result.error.code.replace('unauthenticated:', '')
      : undefined;
    if (normalized.category === 'AUTHENTICATION_ERROR' && firebaseAuthCode) {
      const diagnostic = firebaseAuthCode;
      console.warn('[GeminiService] La función rechazó el token de sesión Firebase.', { sourceCode: diagnostic, category: normalized.category, httpStatus: status });
      if (diagnostic === 'auth/id-token-expired') {
        normalized.message = 'Tu sesión de Firebase expiró. Inicia sesión nuevamente con Google para renovarla.';
      } else if (diagnostic === 'auth/argument-error' || diagnostic === 'auth/invalid-id-token') {
        normalized.message = 'Tu sesión de Google no coincide con el proyecto de Firebase configurado en el servidor.';
      }
    }
    return normalized;
  }

  private async requestText(
    body: { prompt: string } | { contents: GeminiContent[] },
    signal?: AbortSignal,
    operationType: AiOperationType = 'content',
  ): Promise<{ ok: true; value: string } | { ok: false; error: AIServiceFailure }> {
    const startedAt = performance.now();
    const operationId = this.createOperationId();
    let requestCount = 0;
    const logResult = (outcome: 'success' | 'error' | 'cancelled', error?: AIServiceFailure, httpStatus?: number) => {
      if (!import.meta.env.DEV) return;
      console.info('[ai.provider-request]', {
        operationId,
        operationType,
        durationMs: Math.round(performance.now() - startedAt),
        outcome,
        ...(error ? {
          category: error.category ?? 'UNKNOWN_ERROR',
          code: error.code,
          ...(error.sourceCode ? { sourceCode: error.sourceCode } : {}),
          ...(error.sourceStatus !== undefined ? { sourceStatus: error.sourceStatus } : {}),
        } : {}),
        ...(httpStatus !== undefined ? { httpStatus } : {}),
        engine: 'gemini',
        functionRequestCount: requestCount,
      });
    };
    if (signal?.aborted) {
      const error: AIServiceFailure = { message: 'Solicitud cancelada.', code: 'ABORTED', retryable: false, category: 'CANCELLED' };
      logResult('cancelled', error);
      return { ok: false, error };
    }
    let idToken = await getFirebaseIdToken();
    if (!idToken) {
      const error: AIServiceFailure = { message: 'Inicia sesión para usar la inteligencia artificial.', code: 'UNAUTHENTICATED', retryable: false, category: 'AUTHENTICATION_ERROR' };
      logResult('error', error);
      return { ok: false, error };
    }

    const send = async (token: string) => {
      requestCount += 1;
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Operation-Id': operationId,
        },
        body: JSON.stringify(body),
        signal,
      });
      const result = await response.json().catch(() => null) as
        | { ok?: boolean; text?: unknown; usedFallback?: unknown; error?: { message?: unknown; code?: unknown; category?: unknown; retryAfterSeconds?: unknown; sourceCode?: unknown; sourceStatus?: unknown } }
        | null;
      return { response, result };
    };

    let response: Response;
    let result: { ok?: boolean; text?: unknown; usedFallback?: unknown; error?: { message?: unknown; code?: unknown; category?: unknown; retryAfterSeconds?: unknown; sourceCode?: unknown; sourceStatus?: unknown } } | null;
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
      const normalized = classifyTransportError(error);
      const serviceError: AIServiceFailure = normalized;
      logResult(normalized.category === 'CANCELLED' ? 'cancelled' : 'error', serviceError);
      return { ok: false, error: serviceError };
    }

    if (!response.ok || !result || result.ok !== true) {
      const error = this.mapFunctionError(response.status, result);
      logResult(error.category === 'CANCELLED' ? 'cancelled' : 'error', error, response.status);
      return { ok: false, error };
    }
    if (typeof result.text !== 'string' || !result.text.trim()) {
      const error: AIServiceFailure = { message: 'El servicio de IA devolvió una respuesta vacía.', code: 'EMPTY_RESPONSE', retryable: false, category: 'INVALID_RESPONSE', httpStatus: response.status };
      logResult('error', error, response.status);
      return { ok: false, error };
    }
    this.usingFallback = result.usedFallback === true;
    logResult('success', undefined, response.status);
    return { ok: true, value: result.text };
  }

  private async generateWelcomeMessageWithModel(
    scenario: ScenarioConfig,
    state: ScenarioState,
    interviewer: InterviewerProfile,
    candidateProfile: { fullName?: string; role?: string; experienceLevel?: string; skills?: string[]; yearsOfExperience?: number; headline?: string; bio?: string; goal?: string; education?: string },
  ): Promise<ChatMessage> {
    const candidateName = candidateProfile.fullName?.trim();
    const prompt = `Inicia la entrevista "${scenario.title}" en primera persona, como ${interviewer.name}.
Saluda y preséntate con tu cargo. ${candidateName ? `Dirígete al candidato como ${candidateName} y formula una pregunta laboral inicial.` : 'Antes de las preguntas laborales, pregunta al candidato cómo se llama.'}
Formula una sola pregunta breve y profesional.
No narres escenas, no describas acciones y no termines con "¿Qué haces?".
Solo texto plano, diálogo directo.`;

    const systemPrompt = this.buildSystemPrompt(
      scenario,
      { role: candidateProfile.role || 'profesional', experienceLevel: candidateProfile.experienceLevel || 'intermedio', candidateName: candidateName || undefined },
      state,
      interviewer,
    );
    const result = await this.requestText({
      contents: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Entendido.' }] },
        { role: 'user', parts: [{ text: prompt }] },
      ],
    }, this.abortController?.signal, 'welcome');
    if (!result.ok) throw Object.assign(new Error(result.error.message), result.error);

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
    userProfile: { role: string; experienceLevel: string; candidateName?: string },
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
- Usa el nombre del candidato solo cuando suene natural; no lo repitas en cada turno ni vuelvas a saludar después de la apertura.
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
PERSONA CANDIDATA: ${userProfile.candidateName || 'nombre pendiente de preguntar'}; nunca confundas su identidad con la de la persona entrevistadora.
El nombre de la persona candidata procede del perfil o de su respuesta de registro. Si está pendiente, pregunta por él una sola vez; no uses el nombre del entrevistador para referirte al candidato.
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
  private mapGeminiError(error: unknown): AIServiceFailure {
    const raw = error instanceof Error ? error.message : String(error);
    if (typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
      const sourceError = error as Partial<AIServiceFailure>;
      const code = sourceError.code!;
      const category = sourceError.category;
      if (category) {
        return {
          message: raw,
          code,
          category,
          retryable: Boolean(sourceError.retryable),
          httpStatus: sourceError.httpStatus,
          sourceCode: sourceError.sourceCode,
          sourceStatus: sourceError.sourceStatus,
        };
      }
      const known: Record<string, AIServiceFailure> = {
        QUOTA_EXCEEDED: { message: raw, code, retryable: false, category: 'RATE_LIMIT_ERROR' },
        UNAUTHENTICATED: { message: raw, code, retryable: false, category: 'AUTHENTICATION_ERROR' },
        PERMISSION_DENIED: { message: raw, code, retryable: false, category: 'PERMISSION_ERROR' },
        SERVICE_UNAVAILABLE: { message: raw, code, retryable: true, category: 'PROVIDER_ERROR' },
        INVALID_RESPONSE: { message: raw, code, retryable: false, category: 'INVALID_RESPONSE' },
        EMPTY_RESPONSE: { message: raw, code, retryable: false, category: 'INVALID_RESPONSE' },
        SERVER_INTERNAL_ERROR: { message: raw, code, retryable: true, category: 'UNKNOWN_ERROR' },
        NETWORK_ERROR: { message: raw, code, retryable: true, category: 'NETWORK_ERROR' },
        CONFIG_MISSING: { message: raw, code, retryable: false, category: 'CONFIGURATION_ERROR' },
        TIMEOUT_ERROR: { message: raw, code, retryable: true, category: 'TIMEOUT_ERROR' },
        TIMEOUT: { message: raw, code, retryable: true, category: 'TIMEOUT_ERROR' },
        ABORTED: { message: raw, code, retryable: false, category: 'CANCELLED' },
      };
      if (known[code]) return known[code];
    }
    const message = raw.toLowerCase();

    // Permanentes: no reintentar
    if (message.includes('api key') || message.includes('api_key') || message.includes('permission denied')) {
      return { message: 'La credencial del servicio de IA no es válida. Revisa la configuración.', code: 'API_KEY_INVALID', retryable: false, category: 'CONFIGURATION_ERROR' };
    }
    if (message.includes('not found') && message.includes('model')) {
      return { message: 'El modelo configurado no está disponible.', code: 'MODEL_UNAVAILABLE', retryable: false, category: 'CONFIGURATION_ERROR' };
    }
    if (message.includes('invalid') && message.includes('argument')) {
      return { message: 'La solicitud al servicio de IA no es válida.', code: 'INVALID_REQUEST', retryable: false, category: 'INVALID_RESPONSE' };
    }
    if (message.includes('too long') || message.includes('context length')) {
      return { message: 'El contexto de la entrevista es demasiado largo.', code: 'CONTEXT_TOO_LONG', retryable: false, category: 'INVALID_RESPONSE' };
    }

    // Transitorios: sí reintentar
    if (message.includes('quota') || message.includes('resource_exhausted') || message.includes('agotó la cuota') || message.includes('429') || message.includes('límite de uso')) {
      return { message: 'Se agotó la cuota del servicio de IA. Espera o revisa el uso del proyecto; no reintentaremos automáticamente.', code: 'QUOTA_EXCEEDED', retryable: false, category: 'RATE_LIMIT_ERROR' };
    }
    if (message.includes('401') || message.includes('unauthenticated')) {
      return { message: 'La sesión no está autorizada para usar el servicio de IA. Inicia sesión nuevamente.', code: 'UNAUTHENTICATED', retryable: false, category: 'AUTHENTICATION_ERROR' };
    }
    if (message.includes('403') || message.includes('permission denied')) {
      return { message: 'El servicio de IA rechazó los permisos de esta solicitud.', code: 'PERMISSION_DENIED', retryable: false, category: 'PERMISSION_ERROR' };
    }
    if (/\b5\d\d\b/.test(message) || message.includes('internal server error')) {
      return { message: 'El servidor del servicio de IA presentó un error temporal.', code: 'SERVICE_UNAVAILABLE', retryable: true, category: 'PROVIDER_ERROR' };
    }
    if (message.includes('overloaded') || message.includes('unavailable')) {
      return { message: 'El servicio de IA está temporalmente no disponible.', code: 'SERVICE_UNAVAILABLE', retryable: true, category: 'PROVIDER_ERROR' };
    }
    if (message.includes('deadline') || message.includes('timeout') || message.includes('timed out')) {
      return { message: 'El servicio de IA tardó demasiado. Puedes reintentar.', code: 'TIMEOUT_ERROR', retryable: true, category: 'TIMEOUT_ERROR' };
    }
    if (message.includes('network') || message.includes('fetch') || message.includes('connection') || message.includes('offline')) {
      return { message: 'Se perdió la conexión. Revisa tu red y reintenta.', code: 'NETWORK_ERROR', retryable: true, category: 'NETWORK_ERROR' };
    }

    return { message: 'Error al comunicarse con el servicio de IA. Puedes reintentar.', code: 'UNKNOWN_ERROR', retryable: true, category: 'UNKNOWN_ERROR' };
  }

  private createOperationId(): string {
    try {
      return crypto.randomUUID();
    } catch {
      return `ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  /** Marca de tiempo para diagnóstico de latencia (solo en desarrollo). */
  private latencyMark(label: string, startMs: number, outcome = 'ok'): void {
    if (import.meta.env.DEV) {
      const elapsed = Math.round(performance.now() - startMs);
      const normalizedLabel = label.toLowerCase();
      const isLocal = normalizedLabel.includes('local') || normalizedLabel.includes('predefinido');
      console.debug('[ai.operation]', {
        operationId: this.createOperationId(),
        operationType: label,
        durationMs: elapsed,
        outcome: isLocal || outcome === 'ok' || outcome === 'local' ? 'success' : 'error',
        ...(isLocal && outcome !== 'ok' && outcome !== 'local' ? { fallbackReason: outcome } : {}),
        ...(!isLocal && outcome !== 'ok' && outcome !== 'local' ? { category: outcome } : {}),
        engine: isLocal ? 'local' : 'gemini',
      });
    }
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
