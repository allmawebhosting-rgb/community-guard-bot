import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export type OnboardingState = {
  completed: boolean;
  step: number;
};

/** Reads onboarding progress for the signed-in user. */
export async function fetchOnboardingState(userId: string): Promise<OnboardingState> {
  const { data } = await supabase
    .from("profiles")
    .select("onboarding_completed, onboarding_step")
    .eq("id", userId)
    .maybeSingle();

  return {
    completed: Boolean(data?.onboarding_completed),
    step: Number(data?.onboarding_step ?? 0),
  };
}

/** Where a freshly signed-in user should land. */
export async function resolvePostAuthPath(userId: string, next?: string) {
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
      if (!active || state.completed) return;
      navigate({ to: "/onboarding", replace: true });
    })();
    return () => {
      active = false;
    };
  }, [navigate]);
}
