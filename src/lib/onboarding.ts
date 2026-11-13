import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export type OnboardingState = {
  completed: boolean;
  step: number;
  /** False when the profile could not be read — never redirect on unknown state. */
  known: boolean;
};

const doneKey = (userId: string) => `allma-onboarded-${userId}`;
export function markOnboardedLocally(userId: string) {
  try { localStorage.setItem(doneKey(userId), "1"); } catch { /* ignore */ }
}

/** Reads onboarding progress for the signed-in user. */
export async function fetchOnboardingState(userId: string): Promise<OnboardingState> {
  const { data, error } = await supabase
    .from("profiles")
    .select("onboarding_completed, onboarding_step")
    .eq("id", userId)
    .maybeSingle();
  let local = false;
  try { local = typeof localStorage !== "undefined" && localStorage.getItem(doneKey(userId)) === "1"; } catch { /* ignore */ }
  const completed = Boolean(data?.onboarding_completed) || local;
  if (completed) markOnboardedLocally(userId);
  return {
    completed,
    step: Number(data?.onboarding_step ?? 0),
    known: !error && Boolean(data),
  };
}

/** Where a freshly signed-in user should land. */
export async function resolvePostAuthPath(userId: string, next?: string) {
  // Invite links must finish first so the connection isn't lost behind onboarding.
  if (next?.startsWith("/invite")) return next;
  const state = await fetchOnboardingState(userId);
  if (!state.completed) return "/onboarding";
  return next ?? "/dashboard";
}

/** Sends signed-in users who never finished onboarding to /onboarding. */
export function useRequireOnboarding() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active || !data.user) return;
      const state = await fetchOnboardingState(data.user.id);
      if (!active || state.completed || !state.known) return;
      navigate({ to: "/onboarding", replace: true });
    })();
    return () => {
      active = false;
    };
  }, [navigate]);
}
