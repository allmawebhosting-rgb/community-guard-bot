import { z } from "zod";

export type FacilityType =
  | "police"
  | "hospital"
  | "fire"
  | "ambulance"
  | "shelter"
  | "pharmacy"
  | "fire_station";

/** Canonical category keys accepted by search_safety_resources / find_facilities. */
export type SafetyResourceCategory =
  | "police"
  | "hospital"
  | "pharmacy"
  | "fire_station"
  | "ambulance"
  | "fire"
  | "shelter";

export const normalizeFacilityType = (raw: unknown): FacilityType => {
  const value = String(raw ?? "").toLowerCase();
  if (value.includes("police")) return "police";
  if (value.includes("pharm") || value.includes("chemist") || value.includes("drugstore")) {
    return "pharmacy";
  }
  if (value.includes("fire")) return "fire";
  if (value.includes("ambulan")) return "ambulance";
  if (value.includes("shelter") || value.includes("safe")) return "shelter";
  return "hospital";
};

/** Map UI/agent categories onto the internal facility_types used by search. */
export function categoriesToFacilityTypes(
  categories: SafetyResourceCategory[] | null | undefined,
): FacilityType[] {
  if (!categories?.length) return ["police", "hospital"];
  const out: FacilityType[] = [];
  for (const c of categories) {
    if (c === "fire_station" || c === "fire") out.push("fire");
    else if (c === "pharmacy") out.push("pharmacy");
    else if (c === "ambulance") out.push("ambulance");
    else if (c === "police") out.push("police");
    else if (c === "shelter") out.push("shelter");
    else out.push("hospital");
  }
  return [...new Set(out)];
}

const facilityTypeEnum = z.enum([
  "police",
  "hospital",
  "fire",
  "ambulance",
  "shelter",
  "pharmacy",
]);

const categoryEnum = z.enum([
  "police",
  "hospital",
  "pharmacy",
  "fire_station",
  "ambulance",
  "fire",
  "shelter",
]);

const areaSchema = z
  .preprocess(
    (value) => {
      if (typeof value !== "string") return null;
      const area = value.trim();
      return /^(nearby|near me|here)$/i.test(area) ? null : area || null;
    },
    z.string().nullable(),
  )
  .nullish()
  .default(null);

/**
 * Shared input for find_facilities and search_safety_resources.
 * Accepts legacy facility_types and newer categories[].
 */
export const facilitySearchInputSchema = z
  .object({
    facility_types: z
      .preprocess(
        (value) => {
          if (Array.isArray(value)) return value.map(normalizeFacilityType);
          if (typeof value === "string") return [normalizeFacilityType(value)];
          return undefined;
        },
        z.array(facilityTypeEnum).optional(),
      )
      .optional(),
    categories: z
      .preprocess(
        (value) => {
          if (!Array.isArray(value)) return undefined;
          return value.map((v) => {
            const n = normalizeFacilityType(v);
            if (n === "fire") return "fire_station" as const;
            return n as SafetyResourceCategory;
          });
        },
        z.array(categoryEnum).optional(),
      )
      .optional(),
    area: areaSchema,
    open_now_only: z
      .preprocess((v) => {
        if (v === true || v === "true" || v === 1) return true;
        if (v === false || v === "false" || v === 0) return false;
        return undefined;
      }, z.boolean().optional())
      .optional(),
  })
  .transform((data) => {
    const fromCategories = data.categories?.length
      ? categoriesToFacilityTypes(data.categories)
      : null;
    const facility_types =
      fromCategories ??
      (data.facility_types?.length ? data.facility_types : ["police", "hospital"]);
    // Pharmacies / clinics default to open_now_only when the model omits it.
    const prefersOpen =
      facility_types.includes("pharmacy") || facility_types.includes("hospital");
    return {
      facility_types,
      categories: data.categories ?? null,
      area: data.area ?? null,
      open_now_only: data.open_now_only ?? (prefersOpen ? true : false),
    };
  });

export type FacilitySearchInput = z.infer<typeof facilitySearchInputSchema>;
