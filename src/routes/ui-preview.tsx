import { createFileRoute } from "@tanstack/react-router";
import { Mic, Phone, PhoneOff, ShieldAlert, Users, Volume2 } from "lucide-react";
import robotAvatar from "@/assets/allma-robot.png";
import { Avatar } from "@/components/allma/safety-network/add-safety-contact";

export const Route = createFileRoute("/ui-preview")({
  head: () => ({
    meta: [{ title: "Chat UI preview — Allma Safety AI" }],
  }),
  component: UiPreviewPage,
});

function PreviewShell({
  title,
  children,
  mobile = false,
}: {
  title: string;
  children: React.ReactNode;
  mobile?: boolean;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">{title}</h2>
      <div
        className={
          mobile
            ? "mx-auto w-full max-w-[390px] overflow-hidden rounded-[1.75rem] border border-border/70 bg-background shadow-lift"
            : "overflow-hidden rounded-[1.5rem] border border-border/70 bg-background shadow-lift"
        }
      >
        {children}
      </div>
    </section>
  );
}

function SharedStrip() {
  return (
    <div className="sos-header-active flex items-center gap-2.5 border-b border-destructive/40 bg-background/85 px-3 py-2">
      <span className="sos-header-ring relative shrink-0 rounded-full">
        <img src={robotAvatar} alt="" className="h-10 w-10 rounded-full border border-border/50 object-cover" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-destructive">
          Shared emergency conversation
        </p>
        <p className="truncate text-[13px] font-bold text-destructive">Calling Safety Network · 2/6</p>
        <p className="truncate text-[11px] text-muted-foreground">
          Ringing James, Sarah · Location shared
        </p>
      </div>
    </div>
  );
}

function CallStrip() {
  return (
    <div className="flex items-center gap-2 border-b border-success/25 bg-background/95 px-3 py-2">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
        <span className="relative h-2.5 w-2.5 rounded-full bg-success" />
      </span>
      <Avatar name="James O." url={null} size={30} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-semibold text-foreground">James O.</span>
        <span className="block truncate text-[10px] text-muted-foreground">Brother · 01:24 connected</span>
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wide text-success">Live</span>
      <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background">
        <Volume2 className="h-4 w-4" />
      </button>
      <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-destructive text-destructive-foreground">
        <PhoneOff className="h-4 w-4" />
      </button>
    </div>
  );
}

function ChatCanvas({ children }: { children: React.ReactNode }) {
  return <div className="chat-canvas min-h-[560px]">{children}</div>;
}

function Composer({ sos = false }: { sos?: boolean }) {
  return (
    <div className={`chat-composer-dock px-3 pt-2 ${sos ? "chat-composer-dock-sos" : ""}`}>
      {sos ? (
        <p className="mb-1.5 px-1 text-[11px] leading-4 text-muted-foreground">
          Shared with Allma and your Safety Network in this chat.
        </p>
      ) : null}
      <div className={`composer-shell composer-pill ${sos ? "composer-shell-sos" : ""}`}>
        <div className="composer-surface flex items-end gap-1 px-2 py-1.5">
          <span className="composer-icon-btn grid h-10 w-10 place-items-center text-muted-foreground">📎</span>
          <div className="min-h-[48px] flex-1 px-1.5 py-3 text-[15px] leading-6 text-muted-foreground">
            {sos ? "Message this emergency…" : "Message Allma..."}
          </div>
          <span className="composer-icon-btn grid h-10 w-10 place-items-center text-muted-foreground">
            <Mic className="h-5 w-5" />
          </span>
          <span className="composer-send-btn grid h-10 w-10 place-items-center rounded-full bg-chat-accent text-chat-accent-foreground">
            ➤
          </span>
        </div>
      </div>
    </div>
  );
}

function UiPreviewPage() {
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-10">
        <header className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">UI preview</p>
          <h1 className="font-display text-3xl font-black tracking-[-0.04em] text-foreground">
            New Allma shared emergency chat
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Static previews of the updated chat UI: normal AI guidance, Activate SOS offer, and one shared
            conversation with Allma + Safety Network responders.
          </p>
        </header>

        <PreviewShell title="1. Normal AI conversation">
          <ChatCanvas>
            <div className="mx-auto flex max-w-3xl flex-col gap-5 px-3 py-6">
              <div className="flex items-start gap-2.5">
                <img src={robotAvatar} alt="" className="mt-0.5 h-8 w-8 rounded-full border border-border/50 object-cover shadow-sm" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="text-[12px] font-semibold tracking-wide text-muted-foreground">Allma</p>
                  <div className="rounded-2xl rounded-tl-md border border-border/45 bg-card/80 px-3.5 py-3 shadow-sm">
                    <p className="text-base leading-[1.6]">
                      Hello, I&apos;m Allma Safety AI. How can I help you today?
                    </p>
                  </div>
                </div>
              </div>
              <div className="ml-auto flex max-w-[85%] flex-col items-end gap-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground">You</p>
                <p className="rounded-[1.15rem] rounded-br-md bg-chat-user px-3.5 py-2.5 text-base leading-[1.6] shadow-sm">
                  Hi Allma, my nose is bleeding.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <img src={robotAvatar} alt="" className="mt-0.5 h-8 w-8 rounded-full border border-border/50 object-cover shadow-sm" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="text-[12px] font-semibold tracking-wide text-muted-foreground">Allma</p>
                  <div className="rounded-2xl rounded-tl-md border border-border/45 bg-card/80 px-3.5 py-3 shadow-sm">
                    <p className="text-base leading-[1.6]">
                      Sit upright and lean slightly forward. Pinch the soft part of your nose for 10 minutes.
                      Avoid tilting your head back.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <Composer />
          </ChatCanvas>
        </PreviewShell>

        <PreviewShell title="2. Soft Activate SOS offer inside the same chat">
          <ChatCanvas>
            <div className="mx-auto flex max-w-3xl flex-col gap-5 px-3 py-6">
              <div className="ml-auto flex max-w-[85%] flex-col items-end gap-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground">You</p>
                <p className="rounded-[1.15rem] rounded-br-md bg-chat-user px-3.5 py-2.5 text-base leading-[1.6] shadow-sm">
                  It keeps bleeding and I feel dizzy.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <img src={robotAvatar} alt="" className="mt-0.5 h-8 w-8 rounded-full border border-border/50 object-cover shadow-sm" />
                <div className="min-w-0 flex-1 space-y-3">
                  <p className="text-[12px] font-semibold tracking-wide text-muted-foreground">Allma</p>
                  <div className="rounded-2xl rounded-tl-md border border-border/45 bg-card/80 px-3.5 py-3 shadow-sm space-y-3">
                    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3.5">
                      <p className="text-[15px] font-semibold text-foreground">
                        Would you like to alert your Safety Network?
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        This keeps your current Allma conversation and invites authorized contacts into it.
                      </p>
                      <button
                        type="button"
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-destructive px-4 py-3.5 text-base font-semibold text-destructive-foreground"
                      >
                        <ShieldAlert className="h-5 w-5" /> Activate SOS
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <a className="flex min-h-8 items-center justify-center gap-1 rounded-lg border border-destructive/35 bg-destructive/5 px-2 py-1 text-[11px] font-semibold text-destructive">
                        <Phone className="h-3.5 w-3.5" /> Call 999 Police
                      </a>
                      <a className="flex min-h-8 items-center justify-center gap-1 rounded-lg border border-destructive/35 bg-destructive/5 px-2 py-1 text-[11px] font-semibold text-destructive">
                        <Phone className="h-3.5 w-3.5" /> Call 112 Toll-free
                      </a>
                    </div>
                    <p className="text-base leading-[1.6]">
                      Keep pinching and stay seated. If dizziness worsens, get help now.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <Composer />
          </ChatCanvas>
        </PreviewShell>

        <PreviewShell title="3. Shared emergency conversation (user + Allma + responders)">
          <ChatCanvas>
            <SharedStrip />
            <CallStrip />
            <div className="mx-auto flex max-w-3xl flex-col gap-4 px-3 py-5">
              <div className="mx-auto flex max-w-[92%] items-center justify-center">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1.5 text-[11px] font-medium text-success">
                  <Users className="h-3 w-3" /> James O. joined the shared conversation.
                </span>
              </div>
              <div className="flex items-end gap-2">
                <Avatar name="James O." url={null} size={30} />
                <div className="min-w-0 max-w-[84%]">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="font-semibold text-foreground">James O.</span>
                    <span className="rounded-full bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
                      Safety contact
                    </span>
                    <time className="text-muted-foreground">9:24 AM</time>
                  </div>
                  <div className="rounded-2xl rounded-bl-md border border-border/55 bg-card px-3.5 py-2.5 text-[14px] leading-relaxed shadow-sm">
                    I&apos;m on my way. Stay seated and keep pressure on your nose.
                  </div>
                </div>
              </div>
              <div className="ml-auto flex max-w-[85%] flex-col items-end gap-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground">You</p>
                <p className="rounded-[1.15rem] rounded-br-md bg-chat-user px-3.5 py-2.5 text-base leading-[1.6] shadow-sm">
                  Okay, still bleeding a little.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <img src={robotAvatar} alt="" className="mt-0.5 h-8 w-8 rounded-full border border-border/50 object-cover shadow-sm" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="text-[12px] font-semibold tracking-wide text-muted-foreground">Allma</p>
                  <div className="rounded-2xl rounded-tl-md border border-border/45 bg-card/80 px-3.5 py-3 shadow-sm">
                    <p className="text-base leading-[1.6]">
                      James is in this conversation now. Keep pinching for the full 10 minutes and tell him if
                      dizziness gets worse.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mx-auto flex max-w-[92%] items-center justify-center">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1.5 text-[11px] font-medium text-success">
                  <Users className="h-3 w-3" /> Sarah K. joined the shared conversation.
                </span>
              </div>
              <div className="flex items-end gap-2">
                <Avatar name="Sarah K." url={null} size={30} />
                <div className="min-w-0 max-w-[84%]">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="font-semibold text-foreground">Sarah K.</span>
                    <span className="rounded-full bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
                      Safety contact
                    </span>
                    <time className="text-muted-foreground">9:26 AM</time>
                  </div>
                  <div className="rounded-2xl rounded-bl-md border border-border/55 bg-card px-3.5 py-2.5 text-[14px] leading-relaxed shadow-sm">
                    <div className="flex min-w-[180px] items-center gap-2">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-muted">
                        <Mic className="h-4 w-4" />
                      </span>
                      <span className="text-sm">Voice note · 00:08</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <Composer sos />
          </ChatCanvas>
        </PreviewShell>

        <PreviewShell title="4. Mobile shared emergency chat" mobile>
          <ChatCanvas>
            <SharedStrip />
            <div className="flex flex-col gap-4 px-3 py-4">
              <div className="flex items-end gap-2">
                <Avatar name="James O." url={null} size={28} />
                <div className="min-w-0 max-w-[84%] rounded-2xl rounded-bl-md border border-border/55 bg-card px-3 py-2 text-[13px] shadow-sm">
                  Stay on the line — I&apos;m 5 minutes away.
                </div>
              </div>
              <div className="ml-auto max-w-[85%] rounded-[1.15rem] rounded-br-md bg-chat-user px-3 py-2 text-[13px] shadow-sm">
                Okay, door is unlocked.
              </div>
              <div className="flex items-start gap-2">
                <img src={robotAvatar} alt="" className="h-7 w-7 rounded-full border object-cover" />
                <div className="rounded-2xl rounded-tl-md border border-border/45 bg-card/80 px-3 py-2 text-[13px] shadow-sm">
                  Keep pressure on. James can see this conversation.
                </div>
              </div>
            </div>
            <Composer sos />
          </ChatCanvas>
        </PreviewShell>
      </div>
    </main>
  );
}
