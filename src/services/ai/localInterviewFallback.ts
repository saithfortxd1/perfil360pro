import type { ChatMessage, ScenarioState } from '@/types/ai';
import type { InterviewerProfile } from '@/services/ai/interviewers';
import type { EvaluationResult } from '@/services/ai/evaluationResponse';

/**
 * Banco de preguntas y respuestas locales por contexto para el simulador de Perfil 360 AI.
 * Permite completar una entrevista de práctica de principio a fin sin depender de llamadas a Gemini
 * cuando se alcanza el límite de cuota (HTTP 429) o no hay conexión con el backend de IA.
 */

export interface LocalTurnResult {
  message: ChatMessage;
  scenarioState: ScenarioState;
  completed: boolean;
}

/**
 * Genera el primer mensaje de bienvenida de la entrevista de forma local,
 * manteniendo el rol e identidad del entrevistador seleccionado (Mateo, James, Andrés).
 */
export function generateLocalWelcomeMessage(
  scenario: { id: string; title: string; description: string; difficulty?: string },
  interviewer: InterviewerProfile,
  candidateName?: string,
): ChatMessage {
  const welcomeText = `Hola, soy ${interviewer.name}, ${interviewer.role.toLowerCase()} en ${interviewer.company}. ` +
    `Vamos a dar inicio a tu entrevista para el escenario "${scenario.title}". ` +
    (candidateName
      ? `${candidateName}, para comenzar, cuéntame brevemente sobre tu trayectoria profesional y qué experiencia relevante tienes frente a este desafío.`
      : 'Antes de comenzar, ¿cuál es tu nombre?');

  return {
    id: `msg_local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    role: 'model',
    content: welcomeText,
    timestamp: Date.now(),
    metadata: {
      scenarioId: scenario.id as ChatMessage['metadata'] extends { scenarioId?: infer T } ? T : never,
      isLocalFallback: true,
    },
  };
}

export function generateLocalCandidateNameTurn(
  candidateName: string,
): ChatMessage {
  return {
    id: `msg_local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    role: 'model',
    content: `Gracias, ${candidateName}. Para comenzar, cuéntame brevemente sobre tu trayectoria profesional y qué experiencia relevante tienes para este puesto.`,
    timestamp: Date.now(),
    metadata: { isLocalFallback: true },
  };
}

export function generateLocalChaosTurn(
  event: { title: string; description: string; id: string; scenarioChanges: Partial<ScenarioState> },
  currentState: ScenarioState,
): { message: ChatMessage; scenarioState: ScenarioState } {
  const changes = event.scenarioChanges ?? {};
  const nextState: ScenarioState = {
    ...currentState,
    ...changes,
    resources: { ...currentState.resources, ...changes.resources },
    progress: Math.min(100, currentState.progress + 5),
  };
  const message: ChatMessage = {
    id: `msg_local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    role: 'model',
    content: `Surgió un cambio importante: ${event.description} ¿Qué priorizarías primero y cómo comunicarías tu decisión al equipo?`,
    timestamp: Date.now(),
    metadata: { eventId: event.id, isLocalFallback: true },
  };
  return { message, scenarioState: nextState };
}

/**
 * Banco de preguntas de seguimiento estructuradas según el avance del candidato.
 */
const FOLLOW_UP_QUESTIONS: readonly string[] = [
  'Excelente. Pensando en una situación real con restricciones de tiempo o recursos, ¿cómo priorizas tus tareas para asegurar entregables de alta calidad?',
  'Comprendo tu enfoque. ¿Podrías compartir un ejemplo concreto donde hayas tenido que resolver un desacuerdo técnico o de prioridades con tu equipo o líderes?',
  'Muy claro. Si el proyecto cambiara radicalmente de objetivos a mitad de camino, ¿qué pasos inmediatos tomarías para mitigar riesgos y alinear a los interesados?',
  'Para profundizar: ¿cuál consideras que ha sido tu mayor aprendizaje profesional en los últimos proyectos y cómo lo aplicarías en este rol?',
  'Muchas gracias por compartir tus respuestas. Hemos cubierto los aspectos clave de esta entrevista de práctica. Cuando desees, puedes concluir para ver tu retroalimentación.',
];

/**
 * Genera la respuesta local a la contestación del usuario en una simulación offline.
 */
export function generateLocalFollowUpTurn(
  userAnswer: string,
  turnIndex: number,
  currentState: ScenarioState,
  askedQuestions: Set<number> = new Set<number>(),
): LocalTurnResult {
  const cleanAnswer = userAnswer.trim();
  const wordCount = cleanAnswer ? cleanAnswer.split(/\s+/).length : 0;

  // Reconocimiento contextual adaptativo
  let acknowledgment = 'Entendido tu planteamiento.';
  if (wordCount < 6) {
    acknowledgment = 'Gracias por tu respuesta, aunque fue breve.';
  } else if (cleanAnswer.toLowerCase().includes('equipo') || cleanAnswer.toLowerCase().includes('lider')) {
    acknowledgment = 'Es valioso el énfasis que pones en el trabajo en equipo y la colaboración.';
  } else if (cleanAnswer.toLowerCase().includes('problema') || cleanAnswer.toLowerCase().includes('soluci')) {
    acknowledgment = 'Se nota un enfoque orientado a la resolución estructurada de problemas.';
  }

  const lowerAnswer = cleanAnswer.toLocaleLowerCase();
  const contextualIndex = lowerAnswer.match(/equipo|lider|colabor|conflicto/)
    ? 1
    : lowerAnswer.match(/riesgo|cambio|crisis|problema|soluci/)
      ? 2
      : lowerAnswer.match(/aprendi|aprendizaje|mejora|resultado|impacto/)
        ? 3
        : lowerAnswer.match(/prior|tiempo|recursos|plazo/)
          ? 0
          : Math.min(turnIndex, FOLLOW_UP_QUESTIONS.length - 1);
  const questionIdx = !askedQuestions.has(contextualIndex)
    ? contextualIndex
    : FOLLOW_UP_QUESTIONS.findIndex((_, index) => !askedQuestions.has(index));
  const safeQuestionIdx = questionIdx < 0 ? FOLLOW_UP_QUESTIONS.length - 1 : questionIdx;
  askedQuestions.add(safeQuestionIdx);
  const nextQuestion = FOLLOW_UP_QUESTIONS[safeQuestionIdx];

  const content = `${acknowledgment} ${nextQuestion}`;

  // Actualizar progreso
  const progressIncrement = Math.round(100 / FOLLOW_UP_QUESTIONS.length);
  const newProgress = Math.min(100, currentState.progress + progressIncrement);

  const updatedState: ScenarioState = {
    ...currentState,
    progress: newProgress,
    resources: {
      ...currentState.resources,
      tiempo: Math.max(10, currentState.resources.tiempo - 15),
      energia: Math.max(20, currentState.resources.energia - 10),
    },
  };

  const message: ChatMessage = {
    id: `msg_local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    role: 'model',
    content,
    timestamp: Date.now(),
    metadata: {
      isLocalFallback: true,
    },
  };

  return { message, scenarioState: updatedState, completed: turnIndex >= FOLLOW_UP_QUESTIONS.length - 1 };
}

/**
 * Genera una evaluación local profesional basada en el historial de la conversación,
 * identificada claramente como evaluación del simulador local para no engañar al usuario.
 */
export function generateLocalEvaluation(messages: ChatMessage[]): EvaluationResult {
  const userMessages = messages.filter((m) => m.role === 'user' && !m.metadata?.isCandidateName);
  const totalTurns = userMessages.length;
  const totalWords = userMessages.reduce((acc, m) => acc + m.content.trim().split(/\s+/).length, 0);
  const avgWords = totalTurns > 0 ? Math.round(totalWords / totalTurns) : 0;

  let score = 70;
  const strengths: string[] = [];
  const improvements: string[] = [];

  if (totalTurns >= 3) {
    score += 10;
    strengths.push('Constancia y participación completa durante los turnos de la entrevista.');
  } else {
    improvements.push('Completar más turnos de interacción para profundizar en tus competencias.');
  }

  if (avgWords >= 20) {
    score += 10;
    strengths.push('Respuestas estructuradas con buen nivel de desarrollo y contexto.');
  } else {
    improvements.push('Aportar mayor detalle y ejemplos específicos basados en tu experiencia real.');
  }

  if (userMessages.some((m) => m.content.length > 80)) {
    strengths.push('Capacidad de argumentar con solidez frente a preguntas de seguimiento.');
  } else {
    improvements.push('Evitar respuestas excesivamente telegráficas en situaciones de entrevista.');
  }

  score = Math.min(95, Math.max(60, score));

  return {
    score,
    strengths: strengths.length > 0 ? strengths : ['Buena disposición inicial para responder las preguntas formuladas.'],
    improvements: improvements.length > 0 ? improvements : ['Seguir practicando situaciones imprevistas para ganar agilidad comunicativa.'],
    summary: `[Evaluación Local del Simulador] Has completado una entrevista de práctica con ${totalTurns} intervenciones. ` +
      `Demostraste coherencia y capacidad de respuesta. Practica incorporar métricas y resultados medibles en cada respuesta.`,
    evaluatedAt: Date.now(),
  };
}
