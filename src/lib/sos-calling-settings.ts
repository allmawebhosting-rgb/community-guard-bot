export type SosCallingSettings = {
  responseWindowSeconds: number;
  retryIntervalSeconds: number;
};

export const DEFAULT_SOS_CALLING_SETTINGS: SosCallingSettings = {
  responseWindowSeconds: 30,
  retryIntervalSeconds: 60,
};

const STORAGE_KEY = "allma:sos-calling-settings";

export function loadSosCallingSettings(): SosCallingSettings {
  if (typeof window === "undefined") return DEFAULT_SOS_CALLING_SETTINGS;
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    return {
      responseWindowSeconds: clamp(stored.responseWindowSeconds, 10, 120, DEFAULT_SOS_CALLING_SETTINGS.responseWindowSeconds),
      retryIntervalSeconds: clamp(stored.retryIntervalSeconds, 30, 600, DEFAULT_SOS_CALLING_SETTINGS.retryIntervalSeconds),
    };
  } catch {
    return DEFAULT_SOS_CALLING_SETTINGS;
  }
}

export function saveSosCallingSettings(settings: SosCallingSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(Math.max(Math.round(number), min), max) : fallback;
}
