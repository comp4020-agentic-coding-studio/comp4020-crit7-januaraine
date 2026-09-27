import { describe, expect, it } from "vitest";
import { canonicalPair, unacknowledgedPairs } from "../src/lib/acknowledgements";

// Pure unit tests for the acknowledgement layer (docs/mvp-plan.md section
// D/G) — no server needed. These never decide whether two sessions clash;
// findAllClashes's output is taken as a given input here (see
// spec/clashes.test.ts for that rule itself).
describe("canonicalPair", () => {
  it("puts the lower id first regardless of call order", () => {
    expect(canonicalPair(1, 2)).toEqual([1, 2]);
    expect(canonicalPair(2, 1)).toEqual([1, 2]);
  });
});

describe("unacknowledgedPairs", () => {
  const A = { id: 1 };
  const B = { id: 2 };
  const C = { id: 3 };

  it("removes an acknowledged pair regardless of which order it was acknowledged in", () => {
    const clashPairs: Array<[typeof A, typeof B]> = [[A, B]];
    expect(unacknowledgedPairs(clashPairs, [{ sessionAId: 1, sessionBId: 2 }])).toEqual([]);
    expect(unacknowledgedPairs(clashPairs, [{ sessionAId: 2, sessionBId: 1 }])).toEqual([]);
  });

  it("does not remove other clashing pairs that were not acknowledged", () => {
    const clashPairs: Array<[typeof A, typeof B | typeof C]> = [
      [A, B],
      [B, C],
    ];
    const result = unacknowledgedPairs(clashPairs, [{ sessionAId: 1, sessionBId: 2 }]);
    expect(result).toEqual([[B, C]]);
  });

  it("leaves the input clash list itself untouched", () => {
    const clashPairs: Array<[typeof A, typeof B]> = [[A, B]];
    unacknowledgedPairs(clashPairs, [{ sessionAId: 1, sessionBId: 2 }]);
    expect(clashPairs).toEqual([[A, B]]);
  });

  it("treats a duplicate acknowledgement of the same pair as a no-op, not a double removal", () => {
    const clashPairs: Array<[typeof A, typeof B]> = [[A, B]];
    const result = unacknowledgedPairs(clashPairs, [
      { sessionAId: 1, sessionBId: 2 },
      { sessionAId: 1, sessionBId: 2 },
    ]);
    expect(result).toEqual([]);
  });

  it("returns every pair unchanged when nothing is acknowledged", () => {
    const clashPairs: Array<[typeof A, typeof B]> = [[A, B]];
    expect(unacknowledgedPairs(clashPairs, [])).toEqual(clashPairs);
  });
});
