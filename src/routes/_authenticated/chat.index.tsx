import { useEffect, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/allma/app-shell";
import { AllmaChat } from "@/components/allma/allma-chat";
import { useAuth } from "@/hooks/useAuth";
import { useRequireOnboarding } from "@/lib/onboarding";
import { createThread, threadsQueryOptions } from "@/lib/threads";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/chat/")({
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === "string" ? { q: search.q } : {},
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
  const { q } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const started = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || started.current) return;
    started.current = true;

    void (async () => {
      try {
        const existing = await queryClient.fetchQuery(threadsQueryOptions());
        const thread = q ? await createThread() : (existing[0] ?? (await createThread()));
        await queryClient.invalidateQueries({ queryKey: ["threads"] });
        navigate({
          to: "/chat/$threadId",
          params: { threadId: thread.id },
          search: q ? { q } : {},
          replace: true,
        });
      } catch {
        started.current = false;
      }
    })();
  }, [isAuthenticated, navigate, queryClient, q]);

  return (
    <AppShell>
      <AllmaChat key={q ?? "guest"} threadId={null} initialPrompt={q} />
    </AppShell>
  );
}
