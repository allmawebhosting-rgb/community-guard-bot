/**
 * Small gazetteer of well-known Ugandan roads, suburbs and towns so a typed
 * place ("Kampala Road", "Wandegeya") can be turned into a centre point and
 * matched against the facility directory by real distance.
 * Coordinates are approximate area centres (WGS84).
 */
export type UgandaPlace = { name: string; district: string; lat: number; lng: number };

const PLACES: Array<UgandaPlace & { aliases?: string[] }> = [
  { name: "Kampala Road", district: "Kampala", lat: 0.3136, lng: 32.5811 },
  { name: "Kampala Central", district: "Kampala", lat: 0.3152, lng: 32.5816, aliases: ["kampala city", "city centre", "city center", "downtown kampala", "kampala cbd"] },
  { name: "Buganda Road", district: "Kampala", lat: 0.3189, lng: 32.5772 },
  { name: "Jinja Road", district: "Kampala", lat: 0.3176, lng: 32.5958 },
  { name: "Entebbe Road", district: "Kampala", lat: 0.2985, lng: 32.5800 },
  { name: "Bombo Road", district: "Kampala", lat: 0.3330, lng: 32.5720 },
  { name: "Gulu Road", district: "Kampala", lat: 0.3550, lng: 32.5690 },
  { name: "Kira Road", district: "Kampala", lat: 0.3370, lng: 32.5880 },
  { name: "Nakasero", district: "Kampala", lat: 0.3240, lng: 32.5800 },
  { name: "Kololo", district: "Kampala", lat: 0.3330, lng: 32.5960 },
  { name: "Wandegeya", district: "Kampala", lat: 0.3330, lng: 32.5720 },
  { name: "Mulago", district: "Kampala", lat: 0.3380, lng: 32.5760 },
  { name: "Makerere", district: "Kampala", lat: 0.3350, lng: 32.5680 },
  { name: "Kamwokya", district: "Kampala", lat: 0.3440, lng: 32.5860 },
  { name: "Ntinda", district: "Kampala", lat: 0.3530, lng: 32.6150 },
  { name: "Bugolobi", district: "Kampala", lat: 0.3170, lng: 32.6170 },
  { name: "Nakawa", district: "Kampala", lat: 0.3290, lng: 32.6150 },
  { name: "Kabalagala", district: "Kampala", lat: 0.2960, lng: 32.5980 },
  { name: "Kansanga", district: "Kampala", lat: 0.2880, lng: 32.6040 },
  { name: "Muyenga", district: "Kampala", lat: 0.2930, lng: 32.6100 },
  { name: "Nsambya", district: "Kampala", lat: 0.3010, lng: 32.5880 },
  { name: "Katwe", district: "Kampala", lat: 0.2990, lng: 32.5740 },
  { name: "Old Kampala", district: "Kampala", lat: 0.3160, lng: 32.5650 },
  { name: "Mengo", district: "Kampala", lat: 0.3030, lng: 32.5630 },
  { name: "Rubaga", district: "Kampala", lat: 0.3030, lng: 32.5530, aliases: ["lubaga"] },
  { name: "Kawempe", district: "Kampala", lat: 0.3780, lng: 32.5580 },
  { name: "Kisenyi", district: "Kampala", lat: 0.3110, lng: 32.5710 },
  { name: "Owino", district: "Kampala", lat: 0.3100, lng: 32.5760, aliases: ["st balikuddembe market", "park yard"] },
  { name: "Kampala", district: "Kampala", lat: 0.3152, lng: 32.5816 },
  { name: "Entebbe", district: "Wakiso", lat: 0.0512, lng: 32.4637 },
  { name: "Wakiso", district: "Wakiso", lat: 0.4044, lng: 32.4594 },
  { name: "Kira", district: "Wakiso", lat: 0.3970, lng: 32.6390 },
  { name: "Najjera", district: "Wakiso", lat: 0.3800, lng: 32.6250 },
  { name: "Nansana", district: "Wakiso", lat: 0.3640, lng: 32.5280 },
  { name: "Mukono", district: "Mukono", lat: 0.3533, lng: 32.7553 },
  { name: "Jinja", district: "Jinja", lat: 0.4244, lng: 33.2042 },
  { name: "Mbarara", district: "Mbarara", lat: -0.6072, lng: 30.6545 },
  { name: "Gulu", district: "Gulu", lat: 2.7724, lng: 32.2881 },
  { name: "Mbale", district: "Mbale", lat: 1.0821, lng: 34.1750 },
  { name: "Lira", district: "Lira", lat: 2.2499, lng: 32.8999 },
  { name: "Masaka", district: "Masaka", lat: -0.3338, lng: 31.7341 },
  { name: "Fort Portal", district: "Kabarole", lat: 0.6710, lng: 30.2750 },
  { name: "Arua", district: "Arua", lat: 3.0201, lng: 30.9111 },
  { name: "Hoima", district: "Hoima", lat: 1.4331, lng: 31.3524 },
  { name: "Soroti", district: "Soroti", lat: 1.7146, lng: 33.6111 },
  { name: "Kabale", district: "Kabale", lat: -1.2486, lng: 29.9899 },
];

const norm = (v: string) => v.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

/** Longest/most specific match wins, so "Kampala Road" beats "Kampala". */
export function resolveUgandaPlace(text: string): UgandaPlace | null {
  const q = ` ${norm(text)} `;
  if (!q.trim()) return null;
  let best: { place: UgandaPlace; len: number } | null = null;
  for (const p of PLACES) {
    for (const key of [p.name, ...(p.aliases ?? [])]) {
      const k = norm(key);
      if (q.includes(` ${k} `) && (!best || k.length > best.len)) {
        best = { place: { name: p.name, district: p.district, lat: p.lat, lng: p.lng }, len: k.length };
      }
    }
  }
  return best?.place ?? null;
}
