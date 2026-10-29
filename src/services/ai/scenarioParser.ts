export interface RawScenarioItem {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  difficulty?: unknown;
}

export interface ParsedScenario {
  id: string;
  title: string;
  description: string;
  difficulty: 'facil' | 'medio' | 'dificil';
}

function normalizeDifficulty(raw: unknown): 'facil' | 'medio' | 'dificil' {
  if (typeof raw !== 'string') return 'medio';
  const clean = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (clean === 'facil') return 'facil';
  if (clean === 'dificil') return 'dificil';
  return 'medio';
}

/**
 * Extrae y valida la lista de escenarios generados por el modelo.
 * Acepta JSON puro o envuelto en bloques Markdown con o sin etiqueta json.
 * Rechaza de forma controlada respuestas truncadas o con elementos inválidos.
 */
export function parseScenariosResponse(responseText: string): ParsedScenario[] {
  const trimmed = responseText.trim();
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  let jsonCandidate = trimmed;
  if (codeBlockMatch && codeBlockMatch[1]) {
    jsonCandidate = codeBlockMatch[1].trim();
  } else {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonCandidate = trimmed.slice(firstBrace, lastBrace + 1).trim();
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch {
    throw new Error('No se encontró JSON válido en la respuesta del generador de escenarios');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('La respuesta del generador de escenarios tiene un formato no válido');
  }

  const rawScenarios = (parsed as { scenarios?: unknown }).scenarios;
  if (!Array.isArray(rawScenarios)) {
    throw new Error('La respuesta no incluye la lista de escenarios requerida');
  }

  if (rawScenarios.length === 0) {
    throw new Error('La lista de escenarios está vacía');
  }

  // Validación estricta: si algún elemento no cumple la estructura mínima, no se descarta silenciosamente
  for (let idx = 0; idx < rawScenarios.length; idx++) {
    const s = rawScenarios[idx];
    if (!s || typeof s !== 'object' || Array.isArray(s)) {
      throw new Error(`El escenario en la posición ${idx + 1} no es un objeto válido`);
    }
    const item = s as Record<string, unknown>;
    if (typeof item.title !== 'string' || item.title.trim() === '') {
      throw new Error(`El escenario en la posición ${idx + 1} no tiene un título válido`);
    }
    if (typeof item.description !== 'string' || item.description.trim() === '') {
      throw new Error(`El escenario en la posición ${idx + 1} no tiene una descripción válida`);
    }
  }

  const validScenarios: ParsedScenario[] = rawScenarios.map((s: unknown, i: number) => {
    const item = s as Record<string, unknown>;
    const rawId = typeof item.id === 'string' && item.id.trim() !== '' ? item.id.trim() : `scenario_${i + 1}`;
    return {
      id: rawId,
      title: (item.title as string).trim(),
      description: (item.description as string).trim(),
      difficulty: normalizeDifficulty(item.difficulty),
    };
  });

  if (validScenarios.length > 10) {
    validScenarios.splice(10);
  }

  // Garantizar identificadores únicos; si hay colisiones o duplicados, reasignar id único
  const seenIds = new Set<string>();
  let hasDuplicateIds = false;
  for (const item of validScenarios) {
    if (seenIds.has(item.id)) {
      hasDuplicateIds = true;
      break;
    }
    seenIds.add(item.id);
  }

  if (hasDuplicateIds) {
    validScenarios.forEach((item, index) => {
      item.id = `scenario_${index + 1}`;
    });
  }

  return validScenarios;
}
