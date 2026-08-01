import { useMemo } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/allma/app-shell";
import { AllmaChat } from "@/components/allma/allma-chat";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
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

  const { data, isLoading } = useQuery({
    queryKey: ["thread-messages", threadId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("messages")
        .select("id, role, parts, created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return rows;
    },
  });

  const initialMessages = useMemo<UIMessage[]>(
    () =>
      (data ?? []).map((row) => ({
        id: row.id,
        role: row.role as UIMessage["role"],
        parts: (Array.isArray(row.parts) ? row.parts : []) as UIMessage["parts"],
      })),
    [data],
  );

  return (
    <AppShell title="Allma Safety AI">
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
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
