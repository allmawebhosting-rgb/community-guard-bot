import { useState } from "react";
import { motion } from "motion/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isLikelyValidPhone } from "@/lib/phone";
import { submitClaim } from "@/lib/lost-found";

export function ClaimForm({ itemId, onDone }: { itemId: string; onDone?: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [proof, setProof] = useState("");
  const [sent, setSent] = useState(false);

  const mutation = useMutation({
    mutationFn: () => submitClaim({ itemId, name, phone, proof }),
    onSuccess: () => {
      setSent(true);
      toast.success("Claim submitted for police review");
      onDone?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (sent) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="premium-surface rounded-2xl border border-border/55 p-5 text-center shadow-soft"
      >
        <CheckCircle2 className="mx-auto h-8 w-8 text-gold" />
        <p className="mt-3 font-display text-[15px] font-bold">Claim sent for review</p>
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">
          An officer will verify your proof of ownership and contact you on the number you gave.
          Nothing is released until they approve it.
        </p>
      </motion.div>
    );
  }

  const valid =
    name.trim().length >= 2 && isLikelyValidPhone(phone) && proof.trim().length >= 10;

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) {
          toast.error("Add your name, a valid phone number, and proof of ownership.");
          return;
        }
        mutation.mutate();
      }}
    >
      <div className="flex items-start gap-2 rounded-2xl border border-gold/30 bg-gold/8 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          Describe marks, contents or numbers only the owner would know. Officers compare this with
          the recorded item before releasing anything.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Your name
          </label>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Full name"
            className="h-11 rounded-xl bg-secondary/40 text-[15px]"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Phone
          </label>
          <Input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="0774 620 951"
            inputMode="tel"
            className="h-11 rounded-xl bg-secondary/40 text-[15px]"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Proof it is yours
        </label>
        <Textarea
          value={proof}
          onChange={(event) => setProof(event.target.value.slice(0, 2000))}
          rows={4}
          placeholder="Scratch on the back cover, the SIM is Airtel ending 0951, a blue receipt inside the side pocket…"
          className="resize-none rounded-2xl bg-secondary/40 text-[15px] focus-visible:ring-gold/40"
        />
        <p className="text-right text-[11px] text-muted-foreground/70">{proof.length}/2000</p>
      </div>

      <Button
        type="submit"
        disabled={mutation.isPending}
        className="h-12 w-full rounded-full text-[15px] font-semibold transition-transform active:scale-[0.98]"
      >
        {mutation.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
          </>
        ) : (
          "Submit claim for review"
        )}
      </Button>
    </form>
  );
}
