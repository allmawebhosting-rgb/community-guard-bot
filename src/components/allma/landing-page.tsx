import { Link } from "@tanstack/react-router";
import { MessageSquare, Shield, Mic, ArrowRight } from "lucide-react";
import { BrandLockup } from "@/components/allma/brand";
import { useAuth } from "@/hooks/useAuth";

const SAMPLE_MESSAGES = [
  {
    type: "bot",
    text: "Hello 👋 I'm Allma Safety AI. How can I help keep you safe today?",
  },
  {
    type: "user",
    text: "I lost my phone",
  },
  {
    type: "bot",
    text: "I'm sorry to hear that. Let me help you report it. Where did you last have it?",
  },
  {
    type: "user",
    text: "At a coffee shop near my office",
  },
  {
    type: "bot",
    text: "Thank you for that information. I can help you file a report with the local police and notify your contacts. Would you like me to proceed?",
  },
];

export function LandingPage() {
  const { isAuthenticated, loading } = useAuth();

  // If authenticated, show chat interface
  if (!loading && isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="sticky top-0 z-30 border-b border-border/50 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-2xl items-center justify-between gap-3 px-6">
          <BrandLockup />
          <div className="flex items-center gap-2">
            <Link
              to="/auth"
              className="rounded-full border border-border/60 px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-accent"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>

      {/* Chat Preview Section */}
      <main className="flex flex-1 items-center justify-center px-6 py-8">
        <div className="w-full max-w-2xl rounded-[2.5rem] border border-border/50 bg-card/40 overflow-hidden shadow-2xl">
          {/* Chat Container */}
          <div className="flex h-[500px] flex-col bg-background">
            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 pt-6 space-y-3">
              {SAMPLE_MESSAGES.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-xs rounded-[1.1rem] px-4 py-2 text-[13px] ${
                      msg.type === "user"
                        ? "rounded-br-sm bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-sm"
                        : "rounded-tl-sm border border-border/50 bg-card/70 text-foreground shadow-sm"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Input Area - Login Prompt */}
            <div className="border-t border-border/50 bg-card/70 p-4">
              <div className="space-y-3">
                <p className="text-center text-[13px] font-semibold text-foreground">
                  Ready to chat with Allma AI?
                </p>
                <p className="text-center text-[12px] text-muted-foreground">
                  Sign in to start reporting, get help, and stay safe.
                </p>
                <div className="flex flex-col gap-2">
                  <Link
                    to="/auth"
                    className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 py-3 text-[13px] font-semibold text-primary-foreground shadow-soft transition-all hover:scale-[1.02] hover:shadow-lift"
                  >
                    Sign in to Continue
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    to="/chat"
                    className="flex items-center justify-center gap-2 rounded-full border border-border/60 bg-card/60 px-6 py-3 text-[13px] font-semibold text-foreground transition-all hover:bg-accent"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Try as Guest
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
