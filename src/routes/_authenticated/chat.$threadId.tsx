import { useMemo } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/allma/app-shell";
import { AllmaChat } from "@/components/allma/allma-chat";
import { listConversationMessages } from "@/lib/sos-rooms";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === "string" ? { q: search.q } : {},
  head: () => ({
    meta: [
      { title: "Conversation — Allma Safety AI" },
      {
        name: "description",
        content: "Your saved conversation with Allma Safety AI, including reports filed from it.",
      },
      { property: "og:title", content: "Conversation — Allma Safety AI" },
      {
        property: "og:description",
        content: "Continue your safety conversation and file reports with Allma Safety AI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatThreadPage,
});

function ChatThreadPage() {
  const { threadId } = useParams({ from: "/_authenticated/chat/$threadId" });
  const { q } = Route.useSearch();

  const { data, isLoading, error } = useQuery({
    queryKey: ["thread-messages", threadId],
    queryFn: () => listConversationMessages(threadId),
    // SOS responders must see pre-join history as soon as membership lands.
    refetchOnMount: "always",
    staleTime: 0,
  });

  const initialMessages = useMemo<UIMessage[]>(
    () =>
      (data ?? []).map((row) => ({
        id: row.sdk_message_id || row.id,
        role: row.role as UIMessage["role"],
        parts: (Array.isArray(row.parts) ? row.parts : []) as UIMessage["parts"],
        authorId: row.user_id,
        createdAt: row.created_at,
      }) as UIMessage),
    [data],
  );

  return (
    <AppShell title="Allma Safety AI">
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          This conversation could not be loaded. Open it again from the SOS call or Call centre.
        </div>
      ) : (
        <AllmaChat
          key={threadId}
          threadId={threadId}
          initialMessages={initialMessages}
          initialPrompt={q}
        />
      )}
    </AppShell>
  );
}
