export interface EvaluationResult {
  score: number;
  strengths: string[];
  improvements: string[];
  summary: string;
  evaluatedAt: number;
}

export function parseEvaluationResponse(content: string): EvaluationResult {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('La evaluación no devolvió un JSON válido.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('La evaluación devolvió un JSON malformado.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('La evaluación devolvió datos con formato inválido.');
  }

  const evaluation = parsed as Record<string, unknown>;
  const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === 'string');

  if (
    typeof evaluation.score !== 'number' ||
    !Number.isFinite(evaluation.score) ||
    evaluation.score < 1 ||
    evaluation.score > 100 ||
    !isStringArray(evaluation.strengths) ||
    !isStringArray(evaluation.improvements) ||
    typeof evaluation.summary !== 'string' ||
    evaluation.summary.trim().length === 0
  ) {
    throw new Error('La evaluación no contiene todos los campos válidos requeridos.');
  }

  return {
    score: Math.round(evaluation.score),
    strengths: evaluation.strengths,
    improvements: evaluation.improvements,
    summary: evaluation.summary,
    evaluatedAt: Date.now(),
  };
}
