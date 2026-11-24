import { useEffect, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/allma/app-shell";
import { AllmaChat } from "@/components/allma/allma-chat";
import { useAuth } from "@/hooks/useAuth";
import { useRequireOnboarding } from "@/lib/onboarding";
import { createThread, threadsQueryOptions } from "@/lib/threads";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/chat/")({
  validateSearch: (search: Record<string, unknown>): { q?: string; sos?: true } => {
    const q = typeof search.q === "string" ? search.q : undefined;
    const sos =
      search.sos === true ||
      search.sos === "true" ||
      search.sos === 1 ||
      search.sos === "1";
    return {
      ...(q ? { q } : {}),
      ...(sos ? { sos: true as const } : {}),
    };
  },
  head: () => ({
    meta: [
      { title: "Allma Safety AI — Chat" },
      {
        name: "description",
        content:
          "Chat with Allma Safety AI to report crime, raise an SOS, find hospitals and police stations, and get calm safety guidance in seconds.",
      },
      { property: "og:title", content: "Allma Safety AI — Chat" },
      {
        property: "og:description",
        content: "Report incidents by chatting. Emergency SOS, crime reports, missing persons, lost & found and nearby help.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatHome,
});

function ChatHome() {
  const { q, sos } = Route.useSearch();
  const navigate = useNavigate();
  useRequireOnboarding();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const started = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || started.current) return;
    started.current = true;

    void (async () => {
      try {
        const existing = await queryClient.fetchQuery(threadsQueryOptions());
        const thread =
          q || sos ? await createThread(sos ? "Emergency SOS" : undefined) : (existing[0] ?? (await createThread()));
        await queryClient.invalidateQueries({ queryKey: ["threads"] });
        navigate({
          to: "/chat/$threadId",
          params: { threadId: thread.id },
          search: {
            ...(q ? { q } : {}),
            ...(sos ? { sos: true as const } : {}),
          },
          replace: true,
        });
      } catch {
        started.current = false;
      }
    })();
  }, [isAuthenticated, navigate, queryClient, q, sos]);

  return (
    <AppShell>
      {/* When sos=1, wait for the redirect into /chat/$threadId?sos=1 so SOS
          starts once in that conversation (avoid a guest-thread double start). */}
      {sos ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          Opening your emergency chat…
        </div>
      ) : (
        <AllmaChat key={q ?? "guest"} threadId={null} initialPrompt={q} />
      )}
    </AppShell>
  );
}
