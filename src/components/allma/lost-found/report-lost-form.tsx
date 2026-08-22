import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export function ReportLostForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ item_type: "", description: "", location_text: "", district: "", occurred_on: "", contact_name: "", contact_phone: "" });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function submit() {
    if (Object.values(form).some((value) => !value.trim())) return;
    setBusy(true);
    const { error } = await supabase.from("lost_found_public_reports").insert(form);
    if (error) toast.error("We could not post your lost-item report."); else { toast.success("Lost-item report sent for police matching."); onDone(); }
    setBusy(false);
  }
  return <div className="grid gap-4 sm:grid-cols-2"><div><Label>Item type</Label><Input value={form.item_type} onChange={(event) => set("item_type", event.target.value)} placeholder="Phone, bag, documents" className="mt-2 h-11 rounded-xl" /></div><div><Label>District</Label><Input value={form.district} onChange={(event) => set("district", event.target.value)} placeholder="Kampala" className="mt-2 h-11 rounded-xl" /></div><div className="sm:col-span-2"><Label>Description</Label><textarea value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="Describe the item and identifying marks" rows={3} className="mt-2 w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" /></div><div><Label>Where was it lost?</Label><Input value={form.location_text} onChange={(event) => set("location_text", event.target.value)} className="mt-2 h-11 rounded-xl" /></div><div><Label>When?</Label><Input type="date" value={form.occurred_on} onChange={(event) => set("occurred_on", event.target.value)} className="mt-2 h-11 rounded-xl" /></div><div><Label>Contact name</Label><Input value={form.contact_name} onChange={(event) => set("contact_name", event.target.value)} className="mt-2 h-11 rounded-xl" /></div><div><Label>Contact phone</Label><Input type="tel" value={form.contact_phone} onChange={(event) => set("contact_phone", event.target.value)} className="mt-2 h-11 rounded-xl" /></div><div className="sm:col-span-2"><Button type="button" onClick={() => void submit()} disabled={busy || Object.values(form).some((value) => !value.trim())} className="w-full rounded-xl">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Post lost item</Button></div></div>;
}
