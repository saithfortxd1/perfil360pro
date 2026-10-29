import { getFirebaseFirestore } from '@/services/firebase/firebase';
import { geminiService } from '@/services/ai/geminiService';
import type { AiErrorCategory, ChatMessage } from '@/types/ai';
import { parseEvaluationResponse, type EvaluationResult } from './evaluationResponse';
import { generateLocalEvaluation } from './localInterviewFallback';
import { createSafePersistenceFailure } from './errorClassification';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export type { EvaluationResult } from './evaluationResponse';

/**
 * Servicio de evaluación de desempeño en simulaciones
 * Extrae el historial del chat, evalúa con Gemini y guarda el puntaje en Firestore
 */

export interface EvaluationInput {
  userId: string;
  scenarioId: string;
  messages: ChatMessage[];
  scenarioState: {
    progress: number;
    resources: Record<string, number>;
  };
}

/**
 * Evalúa el desempeño del usuario en una simulación
 * @param input - Datos de la simulación completada
 * @returns Resultado de la evaluación con puntaje 1-100
 */
export async function evaluatePerformance(
  input: EvaluationInput
): Promise<{ ok: true; value: EvaluationResult } | { ok: false; error: { message: string; code: string; retryable: boolean; category?: AiErrorCategory } }> {
  const startedAt = performance.now();
  const operationId = createEvaluationOperationId();
  const { messages, scenarioId, scenarioState } = input;

  // Filtrar mensajes del usuario y del modelo
  const userMessages = messages.filter(m => m.role === 'user' && !m.metadata?.isCandidateName);
  if (userMessages.length === 0) {
    return {
      ok: false,
      error: { message: 'No hay mensajes del usuario para evaluar', code: 'NO_DATA', retryable: false },
    };
  }

  if (geminiService.isUsingFallback()) {
    logEvaluation(operationId, startedAt, 'success', 'local');
    return { ok: true, value: generateLocalEvaluation(messages) };
  }

  // Construir prompt de evaluación
  const evaluationPrompt = buildEvaluationPrompt(scenarioId, messages, scenarioState);

  try {
    // Usar generateContent para no contaminar la sesión de chat activa
    const result = await geminiService.generateContent(evaluationPrompt, undefined, 'evaluation');

    if (!result.ok) {
      const local = generateLocalEvaluation(messages);
      logEvaluation(operationId, startedAt, 'success', 'local');
      return { ok: true, value: { ...local, summary: `[Evaluación local; Gemini respondió ${result.error.code}] ${local.summary}` } };
    }

    // Parsear la respuesta del modelo
    let evaluation: EvaluationResult;
    try {
      evaluation = parseEvaluationResponse(result.value);
    } catch {
      const local = generateLocalEvaluation(messages);
      logEvaluation(operationId, startedAt, 'success', 'local');
      return { ok: true, value: { ...local, summary: `[Evaluación local; respuesta de IA inválida o truncada] ${local.summary}` } };
    }

    // Guardar en Firestore
    await saveEvaluationToFirestore(input.userId, evaluation);

    logEvaluation(operationId, startedAt, 'success', 'gemini');
    return { ok: true, value: evaluation };
  } catch {
    logEvaluation(operationId, startedAt, 'error', geminiService.isUsingFallback() ? 'local' : 'gemini', 'PERSISTENCE_ERROR');
    const persistenceError = createSafePersistenceFailure(
      'EVALUATION_PERSISTENCE_ERROR',
      'No se pudo guardar la evaluación en el historial del perfil.',
    );
    return {
      ok: false,
      error: {
        ...persistenceError,
      },
    };
  }
}

function createEvaluationOperationId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `evaluation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function logEvaluation(
  operationId: string,
  startedAt: number,
  outcome: 'success' | 'error',
  engine: 'gemini' | 'local',
  category?: string,
): void {
  if (!import.meta.env.DEV) return;
  console.info('[ai.operation]', {
    operationId,
    operationType: 'evaluation',
    durationMs: Math.round(performance.now() - startedAt),
    outcome,
    ...(category ? { category } : {}),
    engine,
  });
}

/**
 * Construye el prompt de evaluación para Gemini
 */
function buildEvaluationPrompt(
  scenarioId: string,
  messages: ChatMessage[],
  scenarioState: { progress: number; resources: Record<string, number> }
): string {
  const conversation = messages
    .filter((message) => !message.metadata?.isCandidateName)
    .map((message) => `${message.role === 'user' ? 'Candidato' : 'Entrevistador'}: ${message.content}`)
    .join('\n');

  return `[EVALUACIÓN DE DESEMPEÑO]

Escenario: ${scenarioId}
Progreso final: ${scenarioState.progress}%
Recursos finales: ${JSON.stringify(scenarioState.resources)}

CONVERSACIÓN COMPLETA:
${conversation}

INSTRUCCIONES:
Evalúa el desempeño del usuario en esta simulación de entrevista/profesional.
Responde ÚNICAMENTE con un JSON válido en este formato:
{
  "score": <número del 1 al 100>,
  "strengths": ["fortaleza 1", "fortaleza 2", ...],
  "improvements": ["área de mejora 1", "área de mejora 2", ...],
  "summary": "resumen breve del desempeño (2-3 oraciones)"
}

Criterios de evaluación:
- Claridad y estructura de las respuestas (25%)
- Relevancia y profundidad del contenido (25%)
- Manejo de situaciones inesperadas (20%)
- Comunicación profesional (15%)
- Adaptabilidad y toma de decisiones (15%)

Sé objetivo y constructivo. No inventes datos que no aparezcan en la conversación.`;
}

/**
 * Guarda la evaluación en Firestore usando setDoc con merge
 */
async function saveEvaluationToFirestore(userId: string, evaluation: EvaluationResult): Promise<void> {
  const firestore = getFirebaseFirestore();
  if (!firestore.ok) {
    throw new Error(firestore.error.message);
  }

  const userRef = doc(firestore.value, 'users', userId);

  await setDoc(userRef, {
    lastEvaluation: {
      score: evaluation.score,
      strengths: evaluation.strengths,
      improvements: evaluation.improvements,
      summary: evaluation.summary,
      evaluatedAt: evaluation.evaluatedAt,
    },
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Obtiene la última evaluación del usuario desde Firestore
 */
export async function getLatestEvaluation(userId: string): Promise<EvaluationResult | null> {
  const firestore = getFirebaseFirestore();
  if (!firestore.ok) return null;

  try {
    const { getDoc } = await import('firebase/firestore');
    const userRef = doc(firestore.value, 'users', userId);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) return null;

    const data = snapshot.data();
    if (!data?.lastEvaluation) return null;

    return {
      score: data.lastEvaluation.score ?? 0,
      strengths: data.lastEvaluation.strengths ?? [],
      improvements: data.lastEvaluation.improvements ?? [],
      summary: data.lastEvaluation.summary ?? '',
      evaluatedAt: data.lastEvaluation.evaluatedAt ?? 0,
    };
  } catch (error) {
    console.error('[EvaluationService] No se pudo leer la evaluación guardada (PERSISTENCE_ERROR).');
    return null;
  }
}
