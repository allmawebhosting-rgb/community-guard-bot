import { useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, FileText, ImagePlus, Loader2, MapPin, Package, Phone, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isLikelyValidPhone } from "@/lib/phone";
import { submitPublicLostReport } from "@/lib/lost-found";
import { supabase } from "@/integrations/supabase/client";

const CATEGORIES = ["Phone", "Bag", "Documents", "Wallet", "Keys", "Other"];
const STEPS = ["The item", "Where & when", "Details", "Photo", "Your contact"];

type PhotoStepProps = { inputRef: React.RefObject<HTMLInputElement | null>; preview: string | null; onPick: (file?: File) => void; onRemove: () => void };
type ReviewProps = { itemType: string; locationText: string; district: string; occurredOn: string; description: string; photo: boolean; contactName: string; contactPhone: string };

export function ReportLostForm({ onDone }: { onDone?: () => void }) {
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

  function pickPhoto(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) { toast.error("Choose an image smaller than 5 MB."); return; }
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(file); setPhotoPreview(URL.createObjectURL(file));
  }

  function removePhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(null); setPhotoPreview(null);
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
      return submitPublicLostReport({ itemType, description, locationText, district, occurredOn, contactName, contactPhone, photoUrl });
    },
    onSuccess: () => { setSent(true); toast.success("Your lost item has been posted for matching"); },
    onError: (error: Error) => { setUploadingPhoto(false); toast.error(error.message); },
  });

  const phoneValid = isLikelyValidPhone(contactPhone);
  const stepValid = step === 0 ? itemType.trim().length >= 2 : step === 4 ? contactName.trim().length >= 2 && phoneValid : true;
  const submitForm = (event: React.FormEvent) => { event.preventDefault(); if (!itemType.trim() || contactName.trim().length < 2 || !phoneValid) { toast.error("Add the item, your name and a valid phone number."); setStep(4); return; } mutation.mutate(); };

  if (sent) return <SuccessPanel onDone={onDone} />;

  return <form onSubmit={submitForm} className="flex min-h-full flex-col"><WizardHeader step={step} /><div className="mt-6 hidden grid-cols-5 gap-2 md:grid">{STEPS.map((label, index) => <div key={label} className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground"><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${index <= step ? "border-gold bg-gold text-background" : "border-border/70"}`}>{index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}</span><span>{label}</span></div>)}</div><AnimatePresence mode="wait" initial={false}><motion.div key={step} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.2 }} className="mx-auto flex w-full max-w-2xl flex-1 items-center py-8 sm:py-12">{step === 0 && <StepShell icon={Package} eyebrow="Step 01 Â· The item" title="What did you lose?" helper="Start with the clearest name you can give the item."><CategoryChips value={category} onChange={setCategory} /><Field label="Item name" required><Input autoFocus value={itemType} onChange={(event) => setItemType(event.target.value)} placeholder="Samsung A14 phone" className="h-12 rounded-xl bg-secondary/40 text-[15px]" /></Field></StepShell>}{step === 1 && <StepShell icon={MapPin} eyebrow="Step 02 Â· Where & when" title="Where did it happen?" helper="A landmark or district helps officers search faster."><div className="grid gap-4 sm:grid-cols-2"><Field label="Place description"><Input value={locationText} onChange={(event) => setLocationText(event.target.value)} placeholder="Kikuubo, near the taxi stage" className="h-12 rounded-xl bg-secondary/40 text-[15px]" /></Field><Field label="District"><Input value={district} onChange={(event) => setDistrict(event.target.value)} placeholder="Kampala" className="h-12 rounded-xl bg-secondary/40 text-[15px]" /></Field><Field label="Date lost"><Input type="date" value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} className="h-12 rounded-xl bg-secondary/40 text-[15px]" /></Field></div></StepShell>}{step === 2 && <StepShell icon={FileText} eyebrow="Step 03 Â· Details" title="Help us recognise it" helper="Include colour, marks, contents, or any serial number you remember."><Field label="Description"><Textarea autoFocus value={description} onChange={(event) => setDescription(event.target.value.slice(0, 1500))} rows={7} placeholder="Black case, cracked corner, documents inside..." className="resize-none rounded-2xl bg-secondary/40 text-[15px] focus-visible:ring-gold/40" /><div className="mt-2 text-right text-[11px] font-semibold tabular-nums text-muted-foreground">{description.length} / 1500</div></Field></StepShell>}{step === 3 && <StepShell icon={ImagePlus} eyebrow="Step 04 Â· Photo" title="Add a photo if you have one" helper="A photo can help matching, but this step is completely optional."><PhotoStep inputRef={fileInputRef} preview={photoPreview} onPick={pickPhoto} onRemove={removePhoto} /></StepShell>}{step === 4 && <StepShell icon={UserRound} eyebrow="Step 05 Â· Your contact" title="Where can officers reach you?" helper="Your details stay private and are shown only to verified officers."><div className="grid gap-4 sm:grid-cols-2"><Field label="Full name" required><Input autoFocus value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Full name" className="h-12 rounded-xl bg-secondary/40 text-[15px]" /></Field><Field label="Phone" required><Input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} placeholder="0774 620 951" inputMode="tel" className={`h-12 rounded-xl bg-secondary/40 text-[15px] ${contactPhone && !phoneValid ? "border-destructive" : ""}`} /></Field></div>{contactPhone && !phoneValid && <p className="mt-2 text-xs font-semibold text-destructive">Enter a valid phone number.</p>}<ReviewSummary itemType={itemType} locationText={locationText} district={district} occurredOn={occurredOn} description={description} photo={Boolean(photo)} contactName={contactName} contactPhone={contactPhone} /></StepShell>}</motion.div></AnimatePresence><div className="sticky bottom-0 -mx-5 flex items-center justify-between gap-3 border-t border-border/60 bg-background/95 px-5 py-4 backdrop-blur-xl sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"><Button type="button" variant="ghost" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || mutation.isPending} className="min-h-11 rounded-xl px-4 font-bold"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>{step < 4 ? <Button type="button" onClick={() => setStep((current) => current + 1)} disabled={!stepValid} className="min-h-11 rounded-xl px-6 font-bold">Continue <ArrowRight className="ml-2 h-4 w-4" /></Button> : <Button type="submit" disabled={!stepValid || mutation.isPending || uploadingPhoto} className="min-h-11 rounded-xl px-6 font-bold">{mutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{uploadingPhoto ? "Uploading photo..." : "Posting..."}</> : <>Post for matching <Check className="ml-2 h-4 w-4" /></>}</Button>}</div></form>;
}

function WizardHeader({ step }: { step: number }) { return <div className="space-y-3"><div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground"><span>Lost item report</span><span className="font-mono tabular-nums text-foreground">{String(step + 1).padStart(2, "0")} / 05</span></div><div className="h-1.5 overflow-hidden rounded-full bg-secondary"><motion.div className="h-full rounded-full bg-gradient-to-r from-gold via-primary-glow to-primary" animate={{ width: `${((step + 1) / 5) * 100}%` }} transition={{ type: "spring", stiffness: 180, damping: 22 }} /></div></div>; }
function StepShell({ icon: Icon, eyebrow, title, helper, children }: { icon: React.ElementType; eyebrow: string; title: string; helper: string; children: ReactNode }) { return <div className="w-full"><div className="mb-7 flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gold/12 text-gold"><Icon className="h-5 w-5" /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">{eyebrow}</p><h3 className="mt-1 font-display text-2xl font-black tracking-[-0.03em]">{title}</h3><p className="mt-1 text-[13px] text-muted-foreground">{helper}</p></div></div>{children}</div>; }
function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) { return <div className="space-y-2"><label className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}{required && <span className="ml-1 text-primary">*</span>}</label>{children}</div>; }
function CategoryChips({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3">{CATEGORIES.map((category) => <button key={category} type="button" onClick={() => onChange(category)} className={`min-h-11 rounded-xl border px-3 text-left text-sm font-bold transition active:scale-[0.98] ${value === category ? "border-gold bg-gold/12 text-gold" : "border-border/60 bg-secondary/30 text-foreground hover:border-gold/40"}`}><Package className="mr-2 inline h-4 w-4" />{category}</button>)}</div>; }
function PhotoStep({ inputRef, preview, onPick, onRemove }: PhotoStepProps) { return <><input ref={inputRef} type="file" accept="image/*" className="sr-only" onChange={(event) => onPick(event.target.files?.[0])} />{preview ? <div className="relative overflow-hidden rounded-2xl border border-border/60"><img src={preview} alt="Preview of lost item" className="h-64 w-full object-cover" /><button type="button" onClick={onRemove} aria-label="Remove photo" className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-black/75 text-white"><X className="h-5 w-5" /></button></div> : <button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-64 w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border/70 bg-secondary/20 text-muted-foreground transition hover:border-gold/60 hover:bg-gold/5"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-gold/12 text-gold"><ImagePlus className="h-7 w-7" /></span><span className="text-sm font-bold text-foreground">Tap to upload a photo</span><span className="text-xs">JPG, PNG, or WEBP Â· up to 5 MB</span></button>}</> ; }
function ReviewSummary({ itemType, locationText, district, occurredOn, description, photo, contactName, contactPhone }: ReviewProps) { const rows = [["Item", itemType], ["Where", [locationText, district].filter(Boolean).join(", ")], ["When", occurredOn], ["Details", description], ["Photo", photo ? "Attached" : "Skipped"], ["Contact", `${contactName || "Your name"}${contactPhone ? ` Â· ${contactPhone}` : ""}`]]; return <div className="mt-7 rounded-2xl border border-border/60 bg-secondary/25 p-4"><p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-gold"><Phone className="h-3.5 w-3.5" /> Review before posting</p><div className="grid gap-2 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="rounded-xl bg-card/50 p-3"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 truncate text-[12px] font-semibold text-foreground">{value || "Not provided"}</p></div>)}</div><p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">Only verified officers see your contact details.</p></div>; }
function SuccessPanel({ onDone }: { onDone?: () => void }) { return <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex min-h-full flex-col items-center justify-center text-center"><motion.div initial={{ scale: 0.7 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260 }} className="grid h-16 w-16 place-items-center rounded-full bg-gold/15 text-gold ring-1 ring-gold/30"><CheckCircle2 className="h-8 w-8" /></motion.div><p className="mt-6 font-display text-3xl font-black">Posted for matching</p><p className="mx-auto mt-3 max-w-md text-[13px] leading-relaxed text-muted-foreground">Your item is now in the matching queue. Verified officers will compare it with property handed in and contact you if they find a likely match.</p><div className="mx-auto mt-6 max-w-sm rounded-2xl border border-border/60 bg-card/65 p-4 text-left"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold">What happens next</p><p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">Keep your phone available. Officers only see your contact details for this match.</p></div><Button type="button" onClick={onDone} className="mt-7 h-12 rounded-xl px-6 font-bold">Back to browsing items <ArrowRight className="ml-2 h-4 w-4" /></Button></motion.div>; }
