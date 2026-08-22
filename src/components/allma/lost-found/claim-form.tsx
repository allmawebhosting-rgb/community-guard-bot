import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ClaimForm({ itemId, onDone }: { itemId: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [proof, setProof] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (name.trim().length < 2 || phone.trim().length < 5 || proof.trim().length < 10) return;
    setBusy(true);
    const { error } = await supabase.from("lost_found_claims").insert({ item_id: itemId, claimant_name: name.trim(), claimant_phone: phone.trim(), proof_text: proof.trim() });
    if (error) toast.error("We could not submit your claim."); else { toast.success("Claim sent for police review."); onDone(); }
    setBusy(false);
  }
  return <div className="space-y-4"><div><Label htmlFor="claim-name">Your name</Label><Input id="claim-name" value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-11 rounded-xl" /></div><div><Label htmlFor="claim-phone">Phone number</Label><Input id="claim-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-2 h-11 rounded-xl" /></div><div><Label htmlFor="claim-proof">What proves it is yours?</Label><textarea id="claim-proof" value={proof} onChange={(event) => setProof(event.target.value)} placeholder="Marks, contents, or a serial number you remember" rows={4} className="mt-2 w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" /></div><p className="text-[11px] text-muted-foreground">Police will review this privately. Your contact details are not public.</p><Button type="button" onClick={() => void submit()} disabled={busy || name.trim().length < 2 || phone.trim().length < 5 || proof.trim().length < 10} className="w-full rounded-xl">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Submit claim</Button></div>;
}
