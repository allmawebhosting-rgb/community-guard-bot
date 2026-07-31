import { useEffect, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppHeader } from "@/components/allma/app-header";
import { AllmaChat } from "@/components/allma/allma-chat";
import { SosButton } from "@/components/allma/sos-button";
import { useAuth } from "@/hooks/useAuth";
import { createThread, threadsQueryOptions } from "@/lib/threads";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Allma Safety AI — AI community safety assistant" },
      {
        name: "description",
        content:
          "Chat with Allma Safety AI to report crime, raise an SOS, find hospitals and police stations, and get calm safety guidance in seconds.",
      },
      { property: "og:title", content: "Allma Safety AI — AI community safety assistant" },
      {
        property: "og:description",
        content:
          "Report incidents by chatting. Emergency SOS, crime reports, missing persons, lost & found and nearby help.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const started = useRef(false);

  useEffect(() => {
    if (loading || !isAuthenticated || started.current) return;
    started.current = true;

    void (async () => {
      try {
        const existing = await queryClient.fetchQuery(threadsQueryOptions());
        const thread = existing[0] ?? (await createThread());
        await queryClient.invalidateQueries({ queryKey: ["threads"] });
        navigate({ to: "/chat/$threadId", params: { threadId: thread.id }, replace: true });
      } catch {
        started.current = false;
      }
    })();
  }, [loading, isAuthenticated, navigate, queryClient]);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="flex min-h-0 flex-1 flex-col">
        <AllmaChat threadId={null} />
      </main>
      <SosButton />
    </div>
  );
}

