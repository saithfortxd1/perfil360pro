export interface SimulationHistoryItem {
  id: string;
  title: string;
  completedAt: number;
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
}

const HISTORY_LIMIT = 20;

function storageKey(uid: string): string {
  return `perfil360.simulation-history.${uid}`;
}

function isHistoryItem(value: unknown): value is SimulationHistoryItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<SimulationHistoryItem>;
  return typeof item.id === 'string'
    && typeof item.title === 'string'
    && typeof item.completedAt === 'number'
    && Number.isFinite(item.completedAt)
    && typeof item.score === 'number'
    && Number.isFinite(item.score)
    && item.score >= 0
    && item.score <= 100
    && typeof item.summary === 'string'
    && Array.isArray(item.strengths)
    && item.strengths.every((entry) => typeof entry === 'string')
    && Array.isArray(item.improvements)
    && item.improvements.every((entry) => typeof entry === 'string');
}

export function loadSimulationHistory(uid: string): SimulationHistoryItem[] {
  if (typeof localStorage === 'undefined' || !uid.trim()) return [];
  const raw = localStorage.getItem(storageKey(uid));
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isHistoryItem)) {
      throw new Error('El historial local de simulaciones tiene un formato inválido.');
    }
    return parsed.slice(0, HISTORY_LIMIT);
  } catch (error) {
    console.error('[simulationHistory] No se pudo leer el historial local:', error instanceof Error ? error.message : 'unknown');
    return [];
  }
}

export function saveSimulationHistory(uid: string, item: SimulationHistoryItem): void {
  if (!uid.trim()) throw new Error('Se requiere un usuario para guardar el historial de simulaciones.');
  if (!isHistoryItem(item)) throw new Error('La evaluación no cumple el formato requerido para el historial.');
  if (typeof localStorage === 'undefined') throw new Error('El almacenamiento local no está disponible.');

  const items = loadSimulationHistory(uid).filter((current) => current.id !== item.id);
  localStorage.setItem(storageKey(uid), JSON.stringify([item, ...items].slice(0, HISTORY_LIMIT)));
}
