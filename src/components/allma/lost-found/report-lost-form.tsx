import { useRef, useState, useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileText,
  ImagePlus,
  Loader2,
  MapPin,
  Package,
  Phone,
  UserRound,
  X,
  Gift,
  Binoculars,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isLikelyValidPhone } from "@/lib/phone";
import { submitPublicLostReport } from "@/lib/lost-found";
import { supabase } from "@/integrations/supabase/client";

const CATEGORIES = ["Phone", "Bag", "Documents", "Wallet", "Keys", "Other"];
const STEPS = ["The item", "Where & when", "Details", "Photo", "Your contact"];

type PhotoStepProps = {
  inputRef: React.RefObject<HTMLInputElement | null>;
  preview: string | null;
  onPick: (file?: File) => void;
  onRemove: () => void;
};

type ReviewProps = {
  itemType: string;
  locationText: string;
  district: string;
  occurredOn: string;
  description: string;
  photo: boolean;
  contactName: string;
  contactPhone: string;
};

type Kind = "lost" | "found";

export function ReportLostForm({
  onDone,
  initialKind,
}: {
  onDone?: () => void;
  initialKind?: Kind;
}) {
  const [kind, setKind] = useState<Kind | null>(initialKind ?? null);
  const [itemType, setItemType] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [locationText, setLocationText] = useState("");
  const [district, setDistrict] = useState("");
  const [occurredOn, setOccurredOn] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [step, setStep] = useState(0);
  const [sent, setSent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

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
      if (!kind) throw new Error("Please select lost or found");

      let photoUrl: string | undefined;

      if (photo) {
        setUploadingPhoto(true);
        const path = `public/${crypto.randomUUID()}-${photo.name.replace(
          /[^a-zA-Z0-9._-]/g,
          "-"
        )}`;
        const { error: uploadError } = await supabase.storage
          .from("lost-found-public")
          .upload(path, photo, { contentType: photo.type, upsert: false });

        if (uploadError) {
          throw new Error(
            "The photo could not be uploaded. You can submit without it."
          );
        }

        photoUrl = supabase.storage
          .from("lost-found-public")
          .getPublicUrl(path).data.publicUrl;
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
        kind,
      });
    },
    onSuccess: () => {
      setSent(true);
      const msg = kind === "lost"
        ? "Your lost item has been posted for matching"
        : "Thank you — this is now with the property desk";
      toast.success(msg);
    },
    onError: (error: Error) => {
      setUploadingPhoto(false);
      toast.error(error.message);
    },
  });

  const phoneValid = isLikelyValidPhone(contactPhone);

  function isStepValid(stepIndex: number) {
    if (stepIndex === 0) return itemType.trim().length >= 2;
    if (stepIndex === 4) return contactName.trim().length >= 2 && phoneValid;
    return true;
  }

  function goBack() {
    if (!kind) {
      onDone?.();
      return;
    }

    if (step === 0) {
      setKind(null);
      return;
    }

    setStep((current) => Math.max(0, current - 1));
  }

  function continueWizard() {
    if (!kind) return;

    if (step === 4) {
      if (!isStepValid(4)) {
        toast.error("Add your name and a valid phone number.");
        return;
      }

      mutation.mutate();
      return;
    }

    if (!isStepValid(step)) {
      if (step === 0) toast.error("Add a clearer item name before continuing.");
      return;
    }

    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  if (!kind) {
    return <KindChoiceScreen onSelectKind={setKind} onClose={onDone} />;
  }

  if (sent) {
    return <SuccessPanel kind={kind} onDone={onDone} />;
  }

  const stepCopy = {
    itemQuestion: kind === "lost" ? "What did you lose?" : "What did you find?",
    itemHelper:
      kind === "lost"
        ? "Start with the clearest name you can give the item."
        : "Describe the item you found.",
    locationQuestion:
      kind === "lost" ? "Where did you lose it?" : "Where did you find it?",
    locationHelper:
      "A landmark or district helps officers search faster.",
    dateLabel: kind === "lost" ? "Date lost" : "Date found",
    contactHelper:
      kind === "lost"
        ? undefined
        : "so the owner can be reunited with it",
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        continueWizard();
      }}
      className="relative z-10 flex min-h-[100dvh] flex-col overflow-hidden"
    >
      <header className="relative z-10 flex min-h-16 shrink-0 items-center justify-between border-b border-border/60 bg-background/70 px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] backdrop-blur-xl sm:px-8">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/70 bg-secondary/60 px-3 text-sm font-bold text-foreground transition hover:bg-accent"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </button>

        <h2 className="font-display text-sm font-black tracking-[0.08em] sm:text-base">
          {kind === "lost" ? "Post a lost item" : "Post a found item"}
        </h2>

        <span className="w-20 text-right text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          {String(step + 1).padStart(2, "0")} / 06
        </span>
      </header>

      <div className="relative z-10 h-1.5 w-full overflow-hidden bg-secondary">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-gold via-primary-glow to-primary"
          animate={{ width: `${((step + 1) / (STEPS.length + 1)) * 100}%` }}
          transition={{ type: "spring", stiffness: 180, damping: 22 }}
        />
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto px-4 pb-28 pt-5 sm:px-8">
        <div className="mx-auto w-full max-w-2xl">
          <div className="hidden gap-2 md:grid md:grid-cols-6">
            {["Lost/Found", ...STEPS].map((label, index) => (
              <div
                key={label}
                className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground"
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
                    index <= step
                      ? "border-gold bg-gold text-background"
                      : "border-border/70"
                  }`}
                >
                  {index < step ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span>{label}</span>
              </div>
            ))}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.2 }}
              className="mx-auto w-full max-w-xl py-8 sm:py-12"
            >
              {step === 0 && (
                <StepShell
                  icon={Package}
                  eyebrow={`Step 01 · The item`}
                  title={stepCopy.itemQuestion}
                  helper={stepCopy.itemHelper}
                >
                  <CategoryChips
                    value={category}
                    onChange={(value) => {
                      setCategory(value);
                      setItemType(value);
                    }}
                  />
                  <Field label="Item name" required>
                    <Input
                      autoFocus
                      value={itemType}
                      onChange={(event) => setItemType(event.target.value)}
                      placeholder={
                        kind === "lost"
                          ? "Samsung A14 phone"
                          : "iPhone left at Makerere library"
                      }
                      className="h-12 rounded-xl bg-secondary/40 text-base"
                    />
                  </Field>
                </StepShell>
              )}

              {step === 1 && (
                <StepShell
                  icon={MapPin}
                  eyebrow={`Step 02 · Where & when`}
                  title={stepCopy.locationQuestion}
                  helper={stepCopy.locationHelper}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Place description">
                      <Input
                        value={locationText}
                        onChange={(event) =>
                          setLocationText(event.target.value)
                        }
                        placeholder="Kikuubo, near the taxi stage"
                        className="h-12 rounded-xl bg-secondary/40 text-base"
                      />
                    </Field>

                    <Field label="District">
                      <Input
                        value={district}
                        onChange={(event) => setDistrict(event.target.value)}
                        placeholder="Kampala"
                        className="h-12 rounded-xl bg-secondary/40 text-base"
                      />
                    </Field>

                    <div className="sm:col-span-2">
                      <Field label={stepCopy.dateLabel}>
                        <Input
                          type="date"
                          value={occurredOn}
                          onChange={(event) =>
                            setOccurredOn(event.target.value)
                          }
                          className="h-12 rounded-xl bg-secondary/40 text-base"
                        />
                      </Field>
                    </div>
                  </div>
                </StepShell>
              )}

              {step === 2 && (
                <StepShell
                  icon={FileText}
                  eyebrow={`Step 03 · Details`}
                  title="Tell us what it looked like"
                  helper="A few details help officers recognise the item quickly."
                >
                  <Field label="Description">
                    <Textarea
                      value={description}
                      onChange={(event) =>
                        setDescription(event.target.value)
                      }
                      rows={5}
                      maxLength={240}
                      placeholder={
                        kind === "lost"
                          ? "It was a black phone case with a cracked screen and a blue strap."
                          : "Silver phone with screen protector, in good condition."
                      }
                      className="min-h-32 rounded-2xl border-border/60 bg-secondary/40 text-base"
                    />
                    <div className="mt-2 flex justify-end text-[11px] font-medium text-muted-foreground">
                      {description.length}/240
                    </div>
                  </Field>
                </StepShell>
              )}

              {step === 3 && (
                <StepShell
                  icon={ImagePlus}
                  eyebrow={`Step 04 · Photo`}
                  title="Add a photo if you have one"
                  helper="Optional but useful for officers matching the item."
                >
                  <PhotoStep
                    inputRef={fileInputRef}
                    preview={photoPreview}
                    onPick={pickPhoto}
                    onRemove={removePhoto}
                  />
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setStep(4)}
                      className="text-[12px] font-bold text-gold"
                    >
                      Skip photo
                    </button>
                  </div>
                </StepShell>
              )}

              {step === 4 && (
                <StepShell
                  icon={UserRound}
                  eyebrow={`Step 05 · Your contact`}
                  title="How should officers reach you?"
                  helper={
                    stepCopy.contactHelper ||
                    "Only verified officers can see this information for a likely match."
                  }
                >
                  <div className="grid gap-4">
                    <Field label="Your name" required>
                      <Input
                        value={contactName}
                        onChange={(event) =>
                          setContactName(event.target.value)
                        }
                        placeholder="Jane Nakato"
                        className="h-12 rounded-xl bg-secondary/40 text-base"
                      />
                    </Field>

                    <Field label="Phone number" required>
                      <Input
                        value={contactPhone}
                        onChange={(event) =>
                          setContactPhone(event.target.value)
                        }
                        placeholder="+256 700 000 000"
                        className="h-12 rounded-xl bg-secondary/40 text-base"
                      />
                      {contactPhone && !phoneValid && (
                        <p className="mt-2 text-[11px] font-medium text-destructive">
                          Enter a valid phone number for Uganda or a trusted
                          local format.
                        </p>
                      )}
                    </Field>

                    <ReviewSummary
                      itemType={itemType}
                      locationText={locationText}
                      district={district}
                      occurredOn={occurredOn}
                      description={description}
                      photo={Boolean(photo)}
                      contactName={contactName}
                      contactPhone={contactPhone}
                    />
                  </div>
                </StepShell>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="relative z-10 border-t border-border/60 bg-background/80 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={goBack}
            className="h-11 rounded-full px-4 font-bold"
          >
            {step === 0 ? "Change" : "Back"}
          </Button>

          <Button
            type="submit"
            disabled={!isStepValid(step) || mutation.isPending || uploadingPhoto}
            className="h-11 rounded-full px-5 font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {step === 4 ? (
              mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Posting...
                </>
              ) : (
                "Post report"
              )
            ) : (
              <>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}

function KindChoiceScreen({
  onSelectKind,
  onClose,
}: {
  onSelectKind: (kind: Kind) => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-4 py-8 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-2xl"
      >
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl font-black tracking-[-0.05em] sm:text-5xl">
            Did you lose it or find it?
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            Choose what brings you here so we can help you in the right way.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <motion.button
            type="button"
            onClick={() => onSelectKind("lost")}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="group relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 to-gold/10 p-6 text-left transition-all hover:border-primary/40 hover:shadow-lg"
          >
            <span className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/20 blur-3xl transition-transform group-hover:scale-150" />
            <div className="relative flex flex-col gap-4">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20 text-primary">
                <Binoculars className="h-7 w-7" />
              </span>
              <div>
                <h3 className="font-display text-2xl font-black tracking-[-0.02em]">
                  I lost something
                </h3>
                <p className="mt-2 text-[13px] text-muted-foreground">
                  Help me find my lost item by posting a report with details.
                </p>
              </div>
            </div>
          </motion.button>

          <motion.button
            type="button"
            onClick={() => onSelectKind("found")}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="group relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-gold/10 to-primary-glow/10 p-6 text-left transition-all hover:border-gold/40 hover:shadow-lg"
          >
            <span className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gold/20 blur-3xl transition-transform group-hover:scale-150" />
            <div className="relative flex flex-col gap-4">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/20 text-gold">
                <Gift className="h-7 w-7" />
              </span>
              <div>
                <h3 className="font-display text-2xl font-black tracking-[-0.02em]">
                  I found something
                </h3>
                <p className="mt-2 text-[13px] text-muted-foreground">
                  Help reunite an item with its owner by posting what you found.
                </p>
              </div>
            </div>
          </motion.button>
        </div>

        {onClose && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={onClose}
              className="text-[13px] font-semibold text-muted-foreground transition hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function StepShell({
  icon: Icon,
  eyebrow,
  title,
  helper,
  children,
}: {
  icon: React.ElementType;
  eyebrow: string;
  title: string;
  helper: string;
  children: ReactNode;
}) {
  return (
    <div className="w-full">
      <div className="mb-7 flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gold/12 text-gold">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
            {eyebrow}
          </p>
          <h3 className="mt-1 font-display text-2xl font-black tracking-[-0.03em]">
            {title}
          </h3>
          <p className="mt-1 text-[13px] text-muted-foreground">{helper}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
        {required && <span className="ml-1 text-primary">*</span>}
      </label>
      {children}
    </div>
  );
}

function CategoryChips({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {CATEGORIES.map((categoryName) => (
        <button
          key={categoryName}
          type="button"
          onClick={() => onChange(categoryName)}
          className={`min-h-11 rounded-xl border px-3 text-left text-sm font-bold transition active:scale-[0.98] ${
            value === categoryName
              ? "border-gold bg-gold/12 text-gold"
              : "border-border/60 bg-secondary/30 text-foreground hover:border-gold/40"
          }`}
        >
          <Package className="mr-2 inline h-4 w-4" />
          {categoryName}
        </button>
      ))}
    </div>
  );
}

function PhotoStep({
  inputRef,
  preview,
  onPick,
  onRemove,
}: PhotoStepProps) {
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => onPick(event.target.files?.[0])}
      />

      {preview ? (
        <div className="relative overflow-hidden rounded-2xl border border-border/60">
          <img
            src={preview}
            alt="Preview of item"
            className="h-64 w-full object-cover"
          />
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove photo"
            className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-black/75 text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex min-h-64 w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border/70 bg-secondary/20 text-muted-foreground transition hover:border-gold/60 hover:bg-gold/5"
        >
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gold/12 text-gold">
            <ImagePlus className="h-7 w-7" />
          </span>
          <span className="text-sm font-bold text-foreground">
            Tap to upload a photo
          </span>
          <span className="text-xs">JPG, PNG, or WEBP · up to 5 MB</span>
        </button>
      )}
    </>
  );
}

function ReviewSummary({
  itemType,
  locationText,
  district,
  occurredOn,
  description,
  photo,
  contactName,
  contactPhone,
}: ReviewProps) {
  const rows = [
    ["Item", itemType],
    ["Where", [locationText, district].filter(Boolean).join(", ")],
    ["When", occurredOn],
    ["Details", description],
    ["Photo", photo ? "Attached" : "Skipped"],
    [
      "Contact",
      `${contactName || "Your name"}${
        contactPhone ? ` · ${contactPhone}` : ""
      }`,
    ],
  ];

  return (
    <div className="mt-7 rounded-2xl border border-border/60 bg-secondary/25 p-4">
      <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-gold">
        <Phone className="h-3.5 w-3.5" /> Review before posting
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-card/50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {label}
            </p>
            <p className="mt-1 truncate text-[12px] font-semibold text-foreground">
              {value || "Not provided"}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        Only verified officers see your contact details.
      </p>
    </div>
  );
}

function SuccessPanel({
  kind,
  onDone,
}: {
  kind: Kind;
  onDone?: () => void;
}) {
  const isLost = kind === "lost";
  const title = isLost ? "Posted for matching" : "Thank you";
  const message = isLost
    ? "Your lost item is now in the matching queue. Verified officers will compare it with property handed in and contact you if they find a likely match."
    : "This item is now with the property desk. Officers will try to reach the owner, or you can check back to see if anyone claims it.";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex min-h-full flex-col items-center justify-center text-center"
    >
      <motion.div
        initial={{ scale: 0.7 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 260 }}
        className="grid h-16 w-16 place-items-center rounded-full bg-gold/15 text-gold ring-1 ring-gold/30"
      >
        <CheckCircle2 className="h-8 w-8" />
      </motion.div>
      <p className="mt-6 font-display text-3xl font-black">{title}</p>
      <p className="mx-auto mt-3 max-w-md text-[13px] leading-relaxed text-muted-foreground">
        {message}
      </p>
      <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-border/60 bg-card/65 p-4 text-left">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold">
          What happens next
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          {isLost
            ? "Keep your phone available. Officers only see your contact details for this match."
            : "We'll keep this item safe and help reunite it with its owner."}
        </p>
      </div>
      <Button
        type="button"
        onClick={onDone}
        className="mt-7 h-12 rounded-xl px-6 font-bold"
      >
        Back to browsing items
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </motion.div>
  );
}
