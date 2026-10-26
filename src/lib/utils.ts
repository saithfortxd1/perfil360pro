export type ClassValue = string | number | false | null | undefined | ClassValue[];

/**
 * Une clases condicionales sin dependencias externas.
 * Se mantiene mínimo a propósito: no hay resolución de conflictos de Tailwind
 * porque el sistema visual no genera clases contradictorias por composición.
 */
export function cn(...values: ClassValue[]): string {
  const output: string[] = [];

  const walk = (value: ClassValue): void => {
    if (value === null || value === undefined || value === false || value === '') return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    output.push(String(value));
  };

  for (const value of values) walk(value);

  return output.join(' ');
}

/** Formatea una fecha a un texto corto y estable en español. */
export function formatDate(epochMs: number): string {
  return new Intl.DateTimeFormat('es', { dateStyle: 'long' }).format(new Date(epochMs));
}
