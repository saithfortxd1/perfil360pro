import { getFirebaseFirestore } from '@/services/firebase/firebase';
import { geminiService } from '@/services/ai/geminiService';
import type { ChatMessage } from '@/types/ai';
import { parseEvaluationResponse, type EvaluationResult } from './evaluationResponse';
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
): Promise<{ ok: true; value: EvaluationResult } | { ok: false; error: { message: string; code: string; retryable: boolean } }> {
  const { messages, scenarioId, scenarioState } = input;

  // Filtrar mensajes del usuario y del modelo
  const userMessages = messages.filter(m => m.role === 'user');
  const modelMessages = messages.filter(m => m.role === 'model');

  if (userMessages.length === 0) {
    return {
      ok: false,
      error: { message: 'No hay mensajes del usuario para evaluar', code: 'NO_DATA', retryable: false },
    };
  }

  // Construir prompt de evaluación
  const evaluationPrompt = buildEvaluationPrompt(scenarioId, userMessages, modelMessages, scenarioState);

  try {
    // Usar generateContent para no contaminar la sesión de chat activa
    const result = await geminiService.generateContent(evaluationPrompt);

    if (!result.ok) {
      return {
        ok: false,
        error: { message: result.error.message, code: result.error.code, retryable: result.error.retryable },
      };
    }

    // Parsear la respuesta del modelo
    const evaluation = parseEvaluationResponse(result.value);

    // Guardar en Firestore
    await saveEvaluationToFirestore(input.userId, evaluation);

    return { ok: true, value: evaluation };
  } catch (error) {
    return {
      ok: false,
      error: {
        message: error instanceof Error ? error.message : 'Error al evaluar desempeño',
        code: 'EVALUATION_ERROR',
        retryable: true,
      },
    };
  }
}

/**
 * Construye el prompt de evaluación para Gemini
 */
function buildEvaluationPrompt(
  scenarioId: string,
  userMessages: ChatMessage[],
  modelMessages: ChatMessage[],
  scenarioState: { progress: number; resources: Record<string, number> }
): string {
  const conversation = userMessages.map((m, i) => {
    const modelResponse = modelMessages[i]?.content || '';
    return `Usuario: ${m.content}\nEntrevistador: ${modelResponse}`;
  }).join('\n\n');

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
    console.error('[EvaluationService] Error fetching evaluation:', error);
    return null;
  }
}