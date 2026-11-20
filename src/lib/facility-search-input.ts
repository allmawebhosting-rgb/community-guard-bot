import { z } from "zod";

export type FacilityType = "police" | "hospital" | "fire" | "ambulance" | "shelter";

export const normalizeFacilityType = (raw: unknown): FacilityType => {
  const value = String(raw ?? "").toLowerCase();
  if (value.includes("police")) return "police";
  if (value.includes("fire")) return "fire";
  if (value.includes("ambulan")) return "ambulance";
  if (value.includes("shelter") || value.includes("safe")) return "shelter";
  return "hospital";
};

export const facilitySearchInputSchema = z.object({
  facility_types: z
    .preprocess(
      (value) => {
        if (Array.isArray(value)) return value.map(normalizeFacilityType);
        if (typeof value === "string") return [normalizeFacilityType(value)];
        return ["police", "hospital"];
      },
      z.array(z.enum(["police", "hospital", "fire", "ambulance", "shelter"])),
    )
    .default(["police", "hospital"]),
  area: z
    .preprocess(
      (value) => {
        if (typeof value !== "string") return null;
        const area = value.trim();
        return /^(nearby|near me|here)$/i.test(area) ? null : area || null;
      },
      z.string().nullable(),
    )
    .nullish()
    .default(null),
});
