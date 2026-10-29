export const AUTO_SEND_SILENCE_MS = 2200;

export function makeAutoSubmitKey(sessionId: string | null, messageCount: number, answer: string): string {
  return `${sessionId ?? 'no-session'}:${messageCount}:${answer.trim().replace(/\s+/g, ' ').toLocaleLowerCase()}`;
}

export function isNewAutoSubmit(key: string, previousKey: string | null): boolean {
  return key.length > 0 && key !== previousKey;
}
