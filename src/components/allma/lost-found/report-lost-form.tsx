import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isLikelyValidPhone } from "@/lib/phone";
import { MAX_PHOTO_BYTES, submitPublicLostReport } from "@/lib/lost-found";

export function ReportLostForm({ onDone }: { onDone?: () => void }) {
  const [itemType, setItemType] = useState("");
  const [description, setDescription] = useState("");
  const [locationText, setLocationText] = useState("");
  const [district, setDistrict] = useState("");
  const [occurredOn, setOccurredOn] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const pickPhoto = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error("That photo is larger than 5MB.");
      return;
    }
    setPhoto(file);
  };

  const mutation = useMutation({
    mutationFn: () =>
      submitPublicLostReport({
        itemType,
        description,
        locationText,
        district,
        occurredOn,
        contactName,
        contactPhone,
        photo,
      }),
    onSuccess: () => {
      setSent(true);
      toast.success("Your lost item has been posted for matching");
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
        <p className="mt-3 font-display text-[15px] font-bold">Posted for matching</p>
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">
          Officers will compare your description with items handed in and call you on the number you
          gave if there is a match.
        </p>
      </motion.div>
    );
  }

  const valid =
    itemType.trim().length >= 2 &&
    contactName.trim().length >= 2 &&
    isLikelyValidPhone(contactPhone);

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) {
          toast.error("Add the item, your name and a valid phone number.");
          return;
        }
        mutation.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What did you lose?">
          <Input
            value={itemType}
            onChange={(event) => setItemType(event.target.value)}
            placeholder="Samsung A14 phone"
            className="h-11 rounded-xl bg-secondary/40 text-[15px]"
          />
        </Field>
        <Field label="When">
          <Input
            type="date"
            value={occurredOn}
            onChange={(event) => setOccurredOn(event.target.value)}
            className="h-11 rounded-xl bg-secondary/40 text-[15px]"
          />
        </Field>
        <Field label="Where">
          <Input
            value={locationText}
            onChange={(event) => setLocationText(event.target.value)}
            placeholder="Kikuubo, near the taxi stage"
            className="h-11 rounded-xl bg-secondary/40 text-[15px]"
          />
        </Field>
        <Field label="District">
          <Input
            value={district}
            onChange={(event) => setDistrict(event.target.value)}
            placeholder="Kampala"
            className="h-11 rounded-xl bg-secondary/40 text-[15px]"
          />
        </Field>
      </div>

      <Field label="Description">
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value.slice(0, 1500))}
          rows={3}
          placeholder="Colour, marks, what was inside, any serial number you remember…"
          className="resize-none rounded-2xl bg-secondary/40 text-[15px] focus-visible:ring-gold/40"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Your name">
          <Input
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
            placeholder="Full name"
            className="h-11 rounded-xl bg-secondary/40 text-[15px]"
          />
        </Field>
        <Field label="Phone">
          <Input
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
            placeholder="0774 620 951"
            inputMode="tel"
            className="h-11 rounded-xl bg-secondary/40 text-[15px]"
          />
        </Field>
      </div>

      <Button
        type="submit"
        disabled={mutation.isPending}
        className="h-12 w-full rounded-full text-[15px] font-semibold transition-transform active:scale-[0.98]"
      >
        {mutation.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Posting…
          </>
        ) : (
          "Post my lost item"
        )}
      </Button>
      <p className="text-center text-[11px] text-muted-foreground/70">
        Your contact details are visible only to verified officers.
      </p>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
