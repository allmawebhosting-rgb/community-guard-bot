/**
 * Small gazetteer of well-known Ugandan roads, suburbs and towns so a typed
 * place ("Kampala Road", "Wandegeya") can be turned into a centre point and
 * matched against the facility directory by real distance.
 * Coordinates are approximate area centres (WGS84).
 */
export type UgandaPlace = { name: string; district: string; lat: number; lng: number };

const PLACES: Array<UgandaPlace & { aliases?: string[] }> = [
  { name: "Kampala Road", district: "Kampala", lat: 0.3136, lng: 32.5811 },
  {
    name: "Kampala Central",
    district: "Kampala",
    lat: 0.3152,
    lng: 32.5816,
    aliases: ["kampala city", "city centre", "city center", "downtown kampala", "kampala cbd"],
  },
  { name: "Buganda Road", district: "Kampala", lat: 0.3189, lng: 32.5772 },
  { name: "Jinja Road", district: "Kampala", lat: 0.3176, lng: 32.5958 },
  { name: "Entebbe Road", district: "Kampala", lat: 0.2985, lng: 32.58 },
  { name: "Bombo Road", district: "Kampala", lat: 0.333, lng: 32.572 },
  { name: "Gulu Road", district: "Kampala", lat: 0.355, lng: 32.569 },
  { name: "Kira Road", district: "Kampala", lat: 0.337, lng: 32.588 },
  { name: "Nakasero", district: "Kampala", lat: 0.324, lng: 32.58 },
  { name: "Kololo", district: "Kampala", lat: 0.333, lng: 32.596 },
  { name: "Wandegeya", district: "Kampala", lat: 0.333, lng: 32.572 },
  { name: "Mulago", district: "Kampala", lat: 0.338, lng: 32.576 },
  { name: "Makerere", district: "Kampala", lat: 0.335, lng: 32.568 },
  { name: "Kamwokya", district: "Kampala", lat: 0.344, lng: 32.586 },
  { name: "Ntinda", district: "Kampala", lat: 0.353, lng: 32.615 },
  { name: "Bugolobi", district: "Kampala", lat: 0.317, lng: 32.617 },
  { name: "Nakawa", district: "Kampala", lat: 0.329, lng: 32.615 },
  { name: "Kabalagala", district: "Kampala", lat: 0.296, lng: 32.598 },
  { name: "Kansanga", district: "Kampala", lat: 0.288, lng: 32.604 },
  { name: "Muyenga", district: "Kampala", lat: 0.293, lng: 32.61 },
  { name: "Nsambya", district: "Kampala", lat: 0.301, lng: 32.588 },
  { name: "Katwe", district: "Kampala", lat: 0.299, lng: 32.574 },
  { name: "Old Kampala", district: "Kampala", lat: 0.316, lng: 32.565 },
  { name: "Mengo", district: "Kampala", lat: 0.303, lng: 32.563 },
  { name: "Rubaga", district: "Kampala", lat: 0.303, lng: 32.553, aliases: ["lubaga"] },
  { name: "Kawempe", district: "Kampala", lat: 0.378, lng: 32.558 },
  { name: "Kisenyi", district: "Kampala", lat: 0.311, lng: 32.571 },
  {
    name: "Owino",
    district: "Kampala",
    lat: 0.31,
    lng: 32.576,
    aliases: ["st balikuddembe market", "park yard"],
  },
  { name: "Kampala", district: "Kampala", lat: 0.3152, lng: 32.5816 },
  { name: "Entebbe", district: "Wakiso", lat: 0.0512, lng: 32.4637 },
  { name: "Wakiso", district: "Wakiso", lat: 0.4044, lng: 32.4594 },
  { name: "Kira", district: "Wakiso", lat: 0.397, lng: 32.639 },
  { name: "Najjera", district: "Wakiso", lat: 0.38, lng: 32.625 },
  { name: "Nansana", district: "Wakiso", lat: 0.364, lng: 32.528 },
  { name: "Mukono", district: "Mukono", lat: 0.3533, lng: 32.7553 },
  { name: "Jinja", district: "Jinja", lat: 0.4244, lng: 33.2042 },
  { name: "Mbarara", district: "Mbarara", lat: -0.6072, lng: 30.6545 },
  { name: "Gulu", district: "Gulu", lat: 2.7724, lng: 32.2881 },
  { name: "Mbale", district: "Mbale", lat: 1.0821, lng: 34.175 },
  { name: "Lira", district: "Lira", lat: 2.2499, lng: 32.8999 },
  { name: "Masaka", district: "Masaka", lat: -0.3338, lng: 31.7341 },
  { name: "Fort Portal", district: "Kabarole", lat: 0.671, lng: 30.275 },
  { name: "Arua", district: "Arua", lat: 3.0201, lng: 30.9111 },
  { name: "Hoima", district: "Hoima", lat: 1.4331, lng: 31.3524 },
  { name: "Soroti", district: "Soroti", lat: 1.7146, lng: 33.6111 },
  { name: "Kabale", district: "Kabale", lat: -1.2486, lng: 29.9899 },
];

const norm = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Search suggestions for common Uganda suburbs, roads and towns. */
export function getUgandaPlaceSuggestions(text: string, limit = 6): UgandaPlace[] {
  const query = norm(text);
  if (query.length < 2) return [];
  return PLACES.filter((place) =>
    [place.name, place.district, ...(place.aliases ?? [])].some((value) =>
      norm(value).includes(query),
    ),
  )
    .slice(0, limit)
    .map(({ name, district, lat, lng }) => ({ name, district, lat, lng }));
}

/** Longest/most specific match wins, so "Kampala Road" beats "Kampala". */
export function resolveUgandaPlace(text: string): UgandaPlace | null {
  const q = ` ${norm(text)} `;
  if (!q.trim()) return null;
  let best: { place: UgandaPlace; len: number } | null = null;
  for (const p of PLACES) {
    for (const key of [p.name, ...(p.aliases ?? [])]) {
      const k = norm(key);
      if (q.includes(` ${k} `) && (!best || k.length > best.len)) {
        best = {
          place: { name: p.name, district: p.district, lat: p.lat, lng: p.lng },
          len: k.length,
        };
      }
    }
  }
  return best?.place ?? null;
}
