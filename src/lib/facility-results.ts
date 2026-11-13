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

type Place = { id: string; name: string; type: string; phone: string | null; distance_m: number; latitude: number; longitude: number; address?: string | null };

export type FilterOptions = {
  /** A real medical emergency was described: hospitals/clinics only, no pharmacies. */
  emergency?: boolean;
};

/** Not a place to take an emergency patient, even if Google tags it as health. */
const NOT_EMERGENCY_CARE = /\b(dental|dentist|dentistry|orthodont|aids information|information cent(?:re|er)|laborator(?:y|ies)|lab\b|diagnostic|optic(?:al|ian|s)?|eye care|veterinar|vet clinic|pharmacy|chemist|drug ?shop|drugstore|spa\b|massage|herbal)/i;
/** Police places that don't take emergencies. */
const NOT_POLICE_HELP = /\b(vehicle inspection|inspection (?:cent(?:re|er)|station|yard|unit)|motor vehicle|driving permit|police (?:shop|canteen|school|barracks|band))/i;

const KAMPALA = { lat: 0.3476, lng: 32.5825 };

/** "Bell Avenue Jinja jinja, Kampala" → "Bell Avenue, Jinja" (no repeated words, no wrong default city). */
export function cleanAddress(address: string | null | undefined, latitude?: number, longitude?: number): string | null {
  if (!address) return null;
  // Collapse words repeated back to back ("Jinja jinja").
  let out = address.replace(/\b([\p{L}]+)(?:[\s,]+\1\b)+/giu, "$1").replace(/\s+,/g, ",").replace(/\s{2,}/g, " ").trim();
  // Drop a trailing "Kampala" when the place is clearly outside Kampala.
  const segs = out.split(/\s*,\s*/).filter(Boolean);
  const last = segs[segs.length - 1]?.toLowerCase();
  const far =
    Number.isFinite(latitude) && Number.isFinite(longitude)
      ? metresBetween(KAMPALA.lat, KAMPALA.lng, Number(latitude), Number(longitude)) > 30_000
      : segs.length > 1 && segs.slice(0, -1).some((s) => /\b(jinja|mbale|gulu|mbarara|masaka|arua|lira|fort portal|entebbe|mukono|tororo|soroti|hoima|kabale|iganga|busia|bugembe|njeru|mityana|kasese|wakiso)\b/i.test(s));
  if (segs.length > 1 && last === "kampala" && far) segs.pop();
  // Repeated segments ("Jinja, Jinja").
  const seen = new Set<string>();
  const unique = segs.filter((s) => {
    const k = s.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  out = unique.join(", ");
  return out || null;
}

function metresBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = (v: number) => (v * Math.PI) / 180;
  const dLat = r(lat2 - lat1);
  const dLng = r(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** Only call something a "Hospital" when its name says so. */
function labelFor(kind: FacilityKind, name: string): string {
  if (kind === "hospital" && !/hospital|referral|ambulance/i.test(name)) return "Health facility";
  return KIND_LABEL[kind] ?? "Facility";
}

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

export function filterAndDedupe<T extends Place>(places: T[], facilityType: string, options: FilterOptions = {}) {
  const medical = facilityType === "hospital" || facilityType === "ambulance";
  const allowed = (ALLOWED[facilityType] ?? []).filter((k) => !(options.emergency && medical && k === "pharmacy"));
  const out: Array<T & { kind: FacilityKind; type_label: string }> = [];
  for (const p of [...places].sort((a, b) => a.distance_m - b.distance_m)) {
    let kind = facilityKind(p.type, p.name);
    // Google often tags clinics as "doctor"/"health"; treat "other" as clinic for medical searches.
    if (kind === "other" && (facilityType === "hospital" || facilityType === "ambulance") && /doctor|health|medical|hospital|clinic/i.test(p.type)) kind = "clinic";
    if (!allowed.includes(kind)) continue;
    const typeAndName = `${p.type} ${p.name}`.replace(/[_-]+/g, " ");
    if (medical && kind !== "pharmacy" && NOT_EMERGENCY_CARE.test(typeAndName)) continue;
    if (facilityType === "police" && NOT_POLICE_HELP.test(p.name)) continue;
    const n = normName(p.name);
    if (out.some((o) => normName(o.name) === n || metres(o, p) < 150 && o.kind === kind && (normName(o.name).includes(n) || n.includes(normName(o.name))))) continue;
    const address = "address" in p ? cleanAddress(p.address, p.latitude, p.longitude) : undefined;
    out.push({ ...p, ...(address !== undefined ? { address } : {}), kind, type_label: labelFor(kind, p.name) });
  }
  return out;
}

export async function refineFacilities<T extends Place>(
  places: T[],
  facilityType: string,
  lookupPhones: (missing: Array<{ id: string; name: string }>) => Promise<Record<string, string>>,
  options: FilterOptions = {},
) {
  const list = filterAndDedupe(places, facilityType, options);
  for (const p of list) if (typeof p.phone === "string" && !p.phone.trim()) p.phone = null;
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
