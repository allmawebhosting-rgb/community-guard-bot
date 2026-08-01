import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Plus } from "lucide-react";
import { toast } from "sonner";
import { BrandMark } from "@/components/allma/brand";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { createThread, threadsQueryOptions } from "@/lib/threads";
import { cn } from "@/lib/utils";

export function ThreadList({
  activeId,
  onNavigate,
  className,
}: {
  activeId?: string | null;
  onNavigate?: () => void;
  className?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { data: threads = [], isLoading } = useQuery({
    ...threadsQueryOptions(),
    enabled: isAuthenticated,
  });

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex h-16 shrink-0 items-center gap-2 px-3">
        <BrandMark className="h-7 w-7 rounded-lg" />
        <p className="brand-gradient-text font-display text-sm font-semibold">Allma chats</p>
      </div>

      <div className="px-3 pb-3">
        <Button
          className="w-full justify-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-soft hover:opacity-95"
          onClick={async () => {
            if (!isAuthenticated) {
              onNavigate?.();
              navigate({ to: "/auth" });
              return;
            }
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
          <Plus className="mr-1.5 h-4 w-4" /> New chat
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        {!isAuthenticated ? (
          <p className="px-2 text-xs text-muted-foreground">
            Sign in to save and revisit your conversations.
          </p>
        ) : isLoading ? (
          <p className="px-2 text-xs text-muted-foreground">Loading…</p>
        ) : threads.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">No conversations yet.</p>
        ) : (
          threads.map((thread) => (
            <Link
              key={thread.id}
              to="/chat/$threadId"
              params={{ threadId: thread.id }}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2 truncate rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                thread.id === activeId && "bg-accent font-medium text-foreground",
              )}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{thread.title}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
