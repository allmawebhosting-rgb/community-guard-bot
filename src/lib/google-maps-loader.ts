const SCRIPT_ID = "allma-google-maps-script";

let loadPromise: Promise<any> | null = null;

export function getGoogleMapsBrowserKey(): string | undefined {
  return import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
}

/** Loads the Google Maps JavaScript API once and resolves with google.maps. */
export function loadGoogleMaps(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  const anyWindow = window as any;
  if (anyWindow.google?.maps) return Promise.resolve(anyWindow.google.maps);
  if (loadPromise) return loadPromise;

  const key = getGoogleMapsBrowserKey();
  if (!key) return Promise.reject(new Error("Google Maps browser key is not configured"));

  loadPromise = new Promise((resolve, reject) => {
    const callbackName = "__allmaGoogleMapsReady";
    anyWindow[callbackName] = () => resolve(anyWindow.google.maps);

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("error", () => reject(new Error("Google Maps failed to load")), {
        once: true,
      });
      return;
    }

    const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as
      | string
      | undefined;
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
      `&loading=async&callback=${callbackName}` +
      (channel ? `&channel=${encodeURIComponent(channel)}` : "");
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Google Maps failed to load"));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

// Google reports referrer/key rejections through this global rather than script onerror.
let authFailed = false;
const authFailureListeners = new Set<() => void>();

export function googleMapsAuthFailed() {
  return authFailed;
}

export function onGoogleMapsAuthFailure(listener: () => void) {
  if (authFailed) listener();
  authFailureListeners.add(listener);
  return () => authFailureListeners.delete(listener);
}

if (typeof window !== "undefined") {
  (window as any).gm_authFailure = () => {
    authFailed = true;
    authFailureListeners.forEach((listener) => listener());
  };
}
