import { getSeededNearbyFacilities } from "@/lib/nearby-fallback";
import { normalizeInfobipPhone } from "@/lib/infobip.server";

export type EmergencyDispatchType = "police" | "medical" | "fire";

export type EmergencyDispatchInput = {
  emergency_type: EmergencyDispatchType;
  user_location?: { lat?: number; lng?: number; area_name?: string } | null;
  situation_brief: string;
  caller_name?: string | null;
};

export type EmergencyDispatchResult = {
  ok: true;
  emergency_type: EmergencyDispatchType;
  official_number: string;
  official_label: string;
  secondary_numbers: Array<{ label: string; number: string }>;
  nearest_station: {
    name: string;
    phone: string | null;
    address: string | null;
    distance_km: number | null;
    kind: string;
  } | null;
  spoken_script: string;
  situation_brief: string;
  area: string | null;
  /** Always false — Allma never auto-dials 999/112/911. */
  auto_dialed: false;
  disclaimer: string;
};

const OFFICIAL: Record<
  EmergencyDispatchType,
  { number: string; label: string; secondary: Array<{ label: string; number: string }> }
> = {
  police: {
    number: "999",
    label: "Police 999",
    secondary: [{ label: "Toll-free 112", number: "112" }],
  },
  medical: {
    number: "911",
    label: "Ambulance 911",
    secondary: [
      { label: "Toll-free 112", number: "112" },
      { label: "Police 999", number: "999" },
    ],
  },
  fire: {
    number: "999",
    label: "Fire / Police 999",
    secondary: [{ label: "Toll-free 112", number: "112" }],
  },
};

export function officialEmergencyNumber(type: EmergencyDispatchType) {
  return OFFICIAL[type];
}

export function buildSpokenDispatchScript(input: {
  callerName: string;
  locationText: string;
  situationBrief: string;
}) {
  const who = input.callerName.trim() || "a caller";
  const where = input.locationText.trim() || "an unknown location in Uganda";
  const brief = input.situationBrief.trim().replace(/\s+/g, " ").slice(0, 220);
  return `My name is ${who}. I am reporting an emergency at ${where}. ${brief} Please send assistance immediately.`;
}

function seedKindFor(type: EmergencyDispatchType): string[] {
  if (type === "medical") return ["hospital", "clinic"];
  if (type === "fire") return ["fire_station", "police"];
  return ["police"];
}

/**
 * Prepare a one-tap official-line dispatch card + nearest desk phone.
 * Never places an automated call to 999/112/911.
 */
export async function prepareEmergencyDispatch(
  input: EmergencyDispatchInput,
): Promise<EmergencyDispatchResult> {
  const official = OFFICIAL[input.emergency_type];
  const lat = Number(input.user_location?.lat);
  const lng = Number(input.user_location?.lng);
  const hasGps = Number.isFinite(lat) && Number.isFinite(lng);
  const center = hasGps
    ? { lat, lng }
    : { lat: 0.3152, lng: 32.5816 };
  const area =
    (input.user_location?.area_name || "").trim() ||
    (hasGps ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : null);

  const kinds = seedKindFor(input.emergency_type);
  let nearest: EmergencyDispatchResult["nearest_station"] = null;

  try {
    const { lookupNearbyPlaces } = await import("@/lib/places.server");
    if (hasGps) {
      const places = await lookupNearbyPlaces({
        latitude: lat,
        longitude: lng,
        types: kinds.includes("police")
          ? ["police"]
          : kinds.includes("hospital")
            ? ["hospital", "medical_clinic"]
            : ["fire_station"],
        radiusMeters: 12_000,
      });
      const top = places?.[0];
      if (top) {
        nearest = {
          name: top.name,
          phone: top.phone || null,
          address: top.address || null,
          distance_km:
            top.distance_m != null ? Math.round(top.distance_m / 100) / 10 : null,
          kind: top.type || kinds[0],
        };
      }
    }
  } catch (error) {
    console.warn("[dispatch] nearby lookup failed", error);
  }

  if (!nearest) {
    const seeded = getSeededNearbyFacilities(center, 15_000).filter((p) =>
      kinds.some((k) => p.type.includes(k) || (k === "clinic" && p.type.includes("hospital"))),
    );
    const top = seeded[0];
    if (top) {
      nearest = {
        name: top.name,
        phone: top.phone || null,
        address: top.address || null,
        distance_km: Math.round(top.distance_m / 100) / 10,
        kind: top.type,
      };
    }
  }

  // Never surface official short codes as "desk" lines.
  if (nearest?.phone) {
    const digits = nearest.phone.replace(/\D/g, "");
    if (/^(999|112|911|101)$/.test(digits) || digits.length < 9) {
      nearest = { ...nearest, phone: null };
    } else {
      const normalized = normalizeInfobipPhone(nearest.phone);
      if (normalized && normalized.length >= 10) {
        nearest = { ...nearest, phone: `+${normalized}` };
      }
    }
  }

  const callerName = (input.caller_name || "a caller").trim();
  const locationText = area || nearest?.address || "my current location in Uganda";
  const spoken_script = buildSpokenDispatchScript({
    callerName,
    locationText,
    situationBrief: input.situation_brief,
  });

  return {
    ok: true,
    emergency_type: input.emergency_type,
    official_number: official.number,
    official_label: official.label,
    secondary_numbers: official.secondary,
    nearest_station: nearest,
    spoken_script,
    situation_brief: input.situation_brief.trim().slice(0, 280),
    area,
    auto_dialed: false,
    disclaimer:
      "Allma never auto-dials 999, 112, or 911. Tap the button to place the call yourself, then read the script to the operator.",
  };
}
