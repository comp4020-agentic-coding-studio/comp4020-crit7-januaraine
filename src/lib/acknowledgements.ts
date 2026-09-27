// Layered on top of src/lib/clashes.ts, never inside it: acknowledgement is
// a stored user decision about a specific pair, while clash detection stays
// a pure, unstored computation — see docs/mvp-plan.md section D/E. Nothing
// here knows how to decide whether two sessions clash; it only knows how to
// canonicalize a pair and filter a computed clash list against a stored one.
export interface AcknowledgedPair {
  sessionAId: number;
  sessionBId: number;
}

// The lower id always comes first, regardless of which order the caller
// names the two sessions in — matches the `check (session_a_id <
// session_b_id)` constraint on clash_acknowledgements.
export function canonicalPair(idA: number, idB: number): [number, number] {
  return idA < idB ? [idA, idB] : [idB, idA];
}

function pairKey(idA: number, idB: number): string {
  const [a, b] = canonicalPair(idA, idB);
  return `${a}:${b}`;
}

// Every pair `findAllClashes` still reports, minus any pair that's been
// acknowledged — what the top alert shows. This never changes which pairs
// clash, only which of them are still "unresolved".
export function unacknowledgedPairs<T extends { id: number }>(
  clashPairs: ReadonlyArray<readonly [T, T]>,
  acknowledged: ReadonlyArray<AcknowledgedPair>,
): Array<readonly [T, T]> {
  const acknowledgedKeys = new Set(acknowledged.map((p) => pairKey(p.sessionAId, p.sessionBId)));
  return clashPairs.filter(([a, b]) => !acknowledgedKeys.has(pairKey(a.id, b.id)));
}
