import { describe, expect, it } from "vitest";
import { PLACE_PHONE_MAX, placeIdsForPhoneLookup, phoneLookupBudgetLeft } from "./places.server";

describe("place phone lookup caps", () => {
  it("keeps at most 5 valid Google ids and skips junk", () => {
    const ids = [
      "google:ChIJ0000000000000000000001",
      "seeded:1",
      "google:bad id",
      "google:ChIJ0000000000000000000002",
      "google:ChIJ0000000000000000000003",
      "google:ChIJ0000000000000000000004",
      "google:ChIJ0000000000000000000005",
      "google:ChIJ0000000000000000000006",
    ];
    const picked = placeIdsForPhoneLookup(ids);
    expect(PLACE_PHONE_MAX).toBe(5);
    expect(picked).toHaveLength(5);
    expect(picked.at(-1)).toBe("google:ChIJ0000000000000000000005");
    expect(picked.some((id) => id.includes("seeded") || id.includes("bad"))).toBe(false);
  });

  it("skips the extra lookups when the time budget is gone", () => {
    expect(phoneLookupBudgetLeft(1_000, 3_600, 2_500)).toBe(0);
    expect(phoneLookupBudgetLeft(1_000, 2_000, 2_500)).toBe(1_500);
  });
});
