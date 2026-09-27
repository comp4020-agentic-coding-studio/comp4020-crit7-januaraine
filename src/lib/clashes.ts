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

// Every currently-clashing pair among a set of sessions, each pair returned
// exactly once (not once per direction). This is what the UI needs to show
// "what's clashing right now" from the full persisted list — a session
// removed from the input simply stops producing pairs, and a session
// involved in several clashes appears in each of them.
export function findAllClashes<T extends SessionInterval>(sessions: readonly T[]): Array<[T, T]> {
  const pairs: Array<[T, T]> = [];
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      if (sessionsClash(sessions[i], sessions[j])) {
        pairs.push([sessions[i], sessions[j]]);
      }
    }
  }
  return pairs;
}
