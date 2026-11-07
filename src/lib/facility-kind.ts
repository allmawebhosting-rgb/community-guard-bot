export type FacilityKind = "hospital" | "clinic" | "pharmacy" | "police" | "fire" | "other";

export function facilityKind(type: string, name = ""): FacilityKind {
  const value = `${type ?? ""} ${name}`.toLowerCase().replace(/[_-]+/g, " ");

  if (value.includes("police")) return "police";
  if (value.includes("fire")) return "fire";
  if (/\b(pharmacy|pharmacies|chemist|drugstore|drug store)\b/.test(value)) return "pharmacy";

  // Many Ugandan primary-care facilities use "Health Centre" in their name.
  // Match those names before the broader hospital fallback, without treating
  // every place containing the word "health" as a hospital.
  if (
    /\b(clinic|clinics|doctor|dispensary|health cent(?:re|er)|medical cent(?:re|er))\b/.test(value)
  ) {
    return "clinic";
  }

  if (/\b(hospital|ambulance)\b/.test(value)) return "hospital";
  return "other";
}
