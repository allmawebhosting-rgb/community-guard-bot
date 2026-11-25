/** Cross-component event so chat facility cards can draw a route on the live SOS map. */
export const GUIDE_TO_PLACE_EVENT = "allma:guide-to-place";

export type GuideToPlaceDetail = {
  id?: string;
  name: string;
  lat: number;
  lng: number;
  phone?: string | null;
  type?: string | null;
};

export function dispatchGuideToPlace(detail: GuideToPlaceDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<GuideToPlaceDetail>(GUIDE_TO_PLACE_EVENT, { detail }));
}
