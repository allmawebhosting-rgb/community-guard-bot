import { useRef, useState } from "react";
import { motion } from "motion/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isLikelyValidPhone } from "@/lib/phone";
import { submitPublicLostReport } from "@/lib/lost-found";
import { supabase } from "@/integrations/supabase/client";

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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sent, setSent] = useState(false);

  function pickPhoto(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      toast.error("Choose an image smaller than 5 MB.");
      return;
    }
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function removePhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const mutation = useMutation({
    mutationFn: async () => {
      let photoUrl: string | undefined;
      if (photo) {
        setUploadingPhoto(true);
        const path = `public/${crypto.randomUUID()}-${photo.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
        const { error: uploadError } = await supabase.storage.from("lost-found-public").upload(path, photo, { contentType: photo.type, upsert: false });
        if (uploadError) throw new Error("The photo could not be uploaded. You can submit without it.");
        photoUrl = supabase.storage.from("lost-found-public").getPublicUrl(path).data.publicUrl;
        setUploadingPhoto(false);
      }
      return submitPublicLostReport({
        itemType,
        description,
        locationText,
        district,
        occurredOn,
        contactName,
        contactPhone,
        photoUrl,
      });
    },
    onSuccess: () => {
      setSent(true);
      toast.success("Your lost item has been posted for matching");
      onDone?.();
    },
    onError: (error: Error) => { setUploadingPhoto(false); toast.error(error.message); },
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

      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Photo <span className="font-normal normal-case tracking-normal">(optional)</span></label>
        <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={(event) => pickPhoto(event.target.files?.[0])} />
        {photoPreview ? (
          <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-secondary/40">
            <img src={photoPreview} alt="Preview of lost item" className="h-44 w-full object-cover" />
            <button type="button" onClick={removePhoto} aria-label="Remove photo" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/70 text-white transition hover:bg-black/85"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <button type="button" onClick={() => fileInputRef.current?.click()} className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 bg-secondary/25 text-muted-foreground transition hover:border-primary/45 hover:bg-primary/5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><ImagePlus className="h-5 w-5" /></span>
            <span className="text-[12px] font-semibold">Tap to upload a photo</span>
            <span className="text-[10px]">JPG, PNG, or WEBP · up to 5 MB</span>
          </button>
        )}
      </div>

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
        disabled={mutation.isPending || uploadingPhoto}
        className="h-12 w-full rounded-full text-[15px] font-semibold transition-transform active:scale-[0.98]"
      >
        {mutation.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {uploadingPhoto ? "Uploading photo…" : "Posting…"}
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
