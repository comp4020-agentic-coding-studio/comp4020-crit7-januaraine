// Two sessions clash iff they fall on the same day and their time intervals
// overlap. Intervals are half-open ([start, end)), so a session ending at
// 11:00 and one starting at 11:00 the same day do not clash — see
// docs/mvp-plan.md section E.
export interface SessionInterval {
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
}

export function sessionsClash(a: SessionInterval, b: SessionInterval): boolean {
  if (a.dayOfWeek !== b.dayOfWeek) return false;
  return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

export function findClashes<T extends SessionInterval>(
  candidate: SessionInterval,
  existing: readonly T[],
): T[] {
  return existing.filter((session) => sessionsClash(candidate, session));
}
