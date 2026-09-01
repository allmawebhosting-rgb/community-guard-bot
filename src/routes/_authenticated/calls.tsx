import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Radio } from "lucide-react";
import { AppShell } from "@/components/allma/app-shell";
import { CallHistory } from "@/components/allma/calls/call-history";
import { BackgroundCallPrompt } from "@/components/allma/calls/background-call-prompt";
import { SosInbox } from "@/components/allma/calls/sos-inbox";
import { EmergencyRoom } from "@/components/allma/calls/emergency-room";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({
  room: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/calls")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Call centre — Allma Safety AI" },
      {
        name: "description",
        content:
          "Where incoming SOS calls land: live emergencies aimed at you, a shared emergency chat, and your Allma call history.",
      },
      { property: "og:title", content: "Allma call centre" },
      {
        property: "og:description",
        content:
          "Answer emergencies from your Safety Network and ask for details in the shared emergency chat.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CallsRoute,
});

function CallsRoute() {
  const { room } = Route.useSearch();
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setUserId(data.user?.id ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  const openRoom = (sosActivityId: string) =>
    void navigate({ to: "/calls", search: { room: sosActivityId } });
  const closeRoom = () => void navigate({ to: "/calls", search: {} });

  return (
    <AppShell title="Call centre">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
        <BackgroundCallPrompt />

        <header className="mb-5">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-destructive">
            <Radio className="h-3 w-3" />
            Live emergency desk
          </p>
          <h1 className="mt-1 font-display text-2xl font-black">Allma call centre</h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Incoming SOS calls land here. Open the emergency chat to ask for details before you
            meet the person who needs help.
          </p>
        </header>

        {room ? (
          <div className="mb-6">
            <EmergencyRoom sosActivityId={room} currentUserId={userId} onClose={closeRoom} />
          </div>
        ) : null}

        <section className="mb-7">
          <h2 className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/65">
            Emergencies aimed at you
          </h2>
          <SosInbox activeRoomId={room ?? null} onOpenRoom={openRoom} />
        </section>

        <section>
          <h2 className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground/65">
            Voice history
          </h2>
          <p className="mb-3 text-[12px] text-muted-foreground">
            Calls are authorized through your Safety Network and carried by ZEGOCLOUD RTC.
          </p>
          <CallHistory />
        </section>
      </div>
    </AppShell>
  );
}
