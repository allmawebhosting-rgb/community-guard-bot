// Cleans nearby-place results for chat: right type only, no duplicates, a type label and a phone where possible.
import { facilityKind, type FacilityKind } from "@/lib/facility-kind";

export const KIND_LABEL: Record<string, string> = {
  police: "Police", hospital: "Hospital", clinic: "Clinic", pharmacy: "Pharmacy", fire: "Fire & Rescue", other: "Health facility",
};

const ALLOWED: Record<string, FacilityKind[]> = {
  hospital: ["hospital", "clinic", "pharmacy"],
  ambulance: ["hospital", "clinic"],
  police: ["police"],
  fire: ["fire"],
  shelter: ["police", "hospital"],
};

type Place = { id: string; name: string; type: string; phone: string | null; distance_m: number; latitude: number; longitude: number };

function normName(name: string) {
  return name.toLowerCase().replace(/\b(the|uganda|ug)\b/g, "").replace(/[^a-z0-9]+/g, "");
}

function metres(a: Place, b: Place) {
  const r = (v: number) => (v * Math.PI) / 180;
  const dLat = r(b.latitude - a.latitude);
  const dLng = r(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export function filterAndDedupe<T extends Place>(places: T[], facilityType: string) {
  const allowed = ALLOWED[facilityType] ?? [];
  const out: Array<T & { kind: FacilityKind; type_label: string }> = [];
  for (const p of [...places].sort((a, b) => a.distance_m - b.distance_m)) {
    let kind = facilityKind(p.type, p.name);
    // Google often tags clinics as "doctor"/"health"; treat "other" as clinic for medical searches.
    if (kind === "other" && (facilityType === "hospital" || facilityType === "ambulance") && /doctor|health|medical|hospital|clinic/i.test(p.type)) kind = "clinic";
    if (!allowed.includes(kind)) continue;
    const n = normName(p.name);
    if (out.some((o) => normName(o.name) === n || metres(o, p) < 150 && o.kind === kind && (normName(o.name).includes(n) || n.includes(normName(o.name))))) continue;
    out.push({ ...p, kind, type_label: KIND_LABEL[kind] ?? "Facility" });
  }
  return out;
}

export async function refineFacilities<T extends Place>(
  places: T[],
  facilityType: string,
  lookupPhones: (missing: Array<{ id: string; name: string }>) => Promise<Record<string, string>>,
) {
  const list = filterAndDedupe(places, facilityType);
  const missing = list.filter((p) => !p.phone).map((p) => ({ id: p.id, name: p.name }));
  if (missing.length) {
    try {
      const phones = await lookupPhones(missing);
      for (const p of list) if (!p.phone && phones[p.id]) p.phone = phones[p.id];
    } catch (err) {
      console.warn("Phone lookup failed", err);
    }
  }
  return list;
}
