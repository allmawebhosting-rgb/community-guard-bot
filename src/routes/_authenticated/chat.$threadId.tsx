import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { Loader2, MessageSquarePlus, PanelLeft } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/allma/app-header";
import { AllmaChat } from "@/components/allma/allma-chat";
import { SosButton } from "@/components/allma/sos-button";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { createThread, threadsQueryOptions } from "@/lib/threads";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
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

function ThreadList({ activeId, onNavigate }: { activeId: string; onNavigate?: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: threads = [], isLoading } = useQuery(threadsQueryOptions());

  return (
    <div className="flex h-full flex-col gap-3">
      <Button
        className="w-full justify-start rounded-2xl"
        onClick={async () => {
          try {
            const thread = await createThread();
            await queryClient.invalidateQueries({ queryKey: ["threads"] });
            onNavigate?.();
            navigate({ to: "/chat/$threadId", params: { threadId: thread.id } });
          } catch {
            toast.error("Could not start a new conversation.");
          }
        }}
      >
        <MessageSquarePlus className="mr-2 h-4 w-4" /> New conversation
      </Button>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {isLoading ? (
          <p className="px-2 text-sm text-muted-foreground">Loading…</p>
        ) : threads.length === 0 ? (
          <p className="px-2 text-sm text-muted-foreground">No conversations yet.</p>
        ) : (
          threads.map((thread) => (
            <Link
              key={thread.id}
              to="/chat/$threadId"
              params={{ threadId: thread.id }}
              onClick={onNavigate}
              className={cn(
                "block truncate rounded-xl px-3 py-2 text-sm transition-colors hover:bg-accent",
                thread.id === activeId && "bg-accent font-medium",
              )}
            >
              {thread.title}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function ChatThreadPage() {
  const { threadId } = useParams({ from: "/_authenticated/chat/$threadId" });
  const [sheetOpen, setSheetOpen] = useState(false);

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

  useEffect(() => {
    setSheetOpen(false);
  }, [threadId]);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-border/70 p-4 lg:block">
          <ThreadList activeId={threadId} />
        </aside>

        <main className="flex min-h-0 flex-1 flex-col">
          <div className="no-print flex items-center gap-2 px-4 pt-3 lg:hidden">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-full">
                  <PanelLeft className="mr-2 h-4 w-4" /> Conversations
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-4">
                <SheetHeader className="px-0">
                  <SheetTitle>Conversations</SheetTitle>
                </SheetHeader>
                <ThreadList activeId={threadId} onNavigate={() => setSheetOpen(false)} />
              </SheetContent>
            </Sheet>
          </div>

          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <AllmaChat key={threadId} threadId={threadId} initialMessages={initialMessages} />
          )}
        </main>
      </div>
      <SosButton />
    </div>
  );
}
