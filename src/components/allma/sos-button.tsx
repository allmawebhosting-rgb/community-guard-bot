import { motion } from "motion/react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { markSosIntent } from "@/lib/sos-intent";
import { markSosChatStart } from "@/lib/sos-chat-request";
import { peekActiveChatThread } from "@/lib/active-chat-thread";
import { useAuth } from "@/hooks/useAuth";

/**
 * Top / floating SOS control. Starts SOS inside the current (or last) chat so
 * the Safety Network joins that same conversation — not a separate SOS page.
 */
export function SosButton({ inline = false }: { inline?: boolean }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { isAuthenticated } = useAuth();

  return (
    <motion.button
      type="button"
      aria-label="Emergency SOS"
      onClick={() => {
        if (!isAuthenticated) {
          toast.error("Sign in so Allma can alert your Safety Network.");
          void navigate({ to: "/auth" });
          return;
        }
        markSosIntent();
        markSosChatStart();
        const chatMatch = pathname.match(/^\/chat\/([^/?#]+)/);
        const threadId = chatMatch?.[1] || peekActiveChatThread();
        if (threadId) {
          void navigate({
            to: "/chat/$threadId",
            params: { threadId },
            search: { sos: true },
            replace: Boolean(chatMatch?.[1]),
          });
          return;
        }
        // No open thread yet — open chat home with sos=1 so it creates/uses one
        // and activates in that conversation.
        void navigate({ to: "/chat", search: { sos: true } });
      }}
      whileTap={{ scale: 0.92 }}
      className={
        inline
          ? "no-print flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-destructive text-destructive-foreground shadow-[0_6px_18px_-6px_rgba(220,38,38,0.6)] active:scale-95"
          : "no-print sos-pulse fixed right-3 top-[4.5rem] z-50 flex h-16 w-16 ring-4 ring-destructive/25 flex-col items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-[0_4px_20px_rgba(220,38,38,0.45)] transition-transform hover:scale-105 active:scale-95 sm:right-6 lg:h-14 lg:w-14"
      }
    >
      <ShieldAlert className="h-6 w-6 lg:h-5 lg:w-5" aria-hidden="true" />
      <span className="text-[9px] font-black uppercase tracking-widest lg:text-[8px]">SOS</span>
    </motion.button>
  );
}
