import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { stepCountIs, streamText, tool } from "ai";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayResponsesProvider } from "@/lib/ai-gateway.server";
import { resolveUgandaPlace } from "@/lib/uganda-places";

const STEPS = ["Welcome", "Profile (name, optional phone)", "Location permission", "Trusted circle (emergency contacts)", "Location sharing preference", "Health reminders yes/no", "Ready — read back a summary and finish"];

const SYSTEM = `You are Allma, the voice safety assistant inside the Allma Safety AI app for Uganda.
You are warm, calm, very smart and genuinely helpful. Your replies are SPOKEN aloud:
- 1 to 3 short sentences of plain speech. No markdown, lists, emojis or URLs. End with one clear question when you need an answer.
- If the person may be in danger: tell them to get somewhere safe, offer SOS. Uganda numbers: Police 999, Emergency 112.
- Never claim you contacted police, an ambulance or anyone. Only say something was saved or filed when a tool returned ok:true, and read back the real reference number.
- You control the app like Siri or Alexa using tools. Use app_action to open pages (/, /dashboard, /nearby, /chat, /safety-network, /calls, /lost-found, /reports, /alerts, /safety, /health-reminders, /profile, /help, /onboarding), go back, start SOS (only when they clearly ask or are in danger now), ask for location permission, or exit voice mode.
- CONFIRMATION RULE: before any tool that saves or files something, read the details back and ask "Shall I go ahead?". Call it with confirmed:true only after the person clearly said yes in their latest message. If they say no, ask what to change.
- To file a report, ask one question at a time: what happened, where, when; then confirm and call create_report.
- For nearby help, call find_facilities and read the top 2 results with name and distance. Never state travel times.
- Things you cannot do yet (sending Safety Network requests to members, creating health reminders, filling other forms): say so honestly and open the right page.`;

function onboardingBlock(step: number, profile: { full_name: string | null; phone: string | null; location_mode: string | null } | null, contacts: { name: string }[]) {
  return `
ONBOARDING MODE — this person has NOT finished setup. Guide them through it by voice, one question at a time, and wait for each answer.
Steps: ${STEPS.map((s, i) => `${i}. ${s}`).join("; ")}.
Current saved step: ${step} (${STEPS[step] ?? "?"}). Saved so far: name=${profile?.full_name ?? "none"}, phone=${profile?.phone ?? "none"}, location sharing=${profile?.location_mode ?? "approximate"}, contacts=${contacts.map((c) => c.name).join(", ") || "none"}.
Rules: Continue from the current step; never skip ahead or restart. Read each answer back to confirm ("I heard Sarah Nakato, is that right?"). After a confirmed answer call save_onboarding with the value and next_step = current step + 1. For location permission (step 2) call app_action request_location, then save_onboarding next_step 3. For contacts, ask name, relationship and phone, confirm, call add_emergency_contact, then ask if there is anyone else; when they say no more, save_onboarding next_step 4. Location sharing choices: approximate, exact-after-accept, never. "Skip" moves to the next step. "Go back" uses next_step = current step - 1. At step 6, read a short summary and ask to finish; on yes call finish_onboarding.`;
}

type Turn = { role: "user" | "assistant"; content: string };
type Action = { type: "navigate"; to: string } | { type: "back" | "sos" | "exit" | "request_location" };

function db(accessToken: string) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const needsConfirm = { ok: false, needs_confirmation: true, message: "Read the details back and ask the person to confirm first." };

export const Route = createFileRoute("/api/voice-assistant")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("Voice assistant is not configured.", { status: 500 });
        let body: { messages?: Turn[]; path?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid request", { status: 400 });
        }
        const messages = (body.messages ?? [])
          .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .slice(-16)
          .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
        if (!messages.length) return new Response("No message", { status: 400 });

        const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
        const supabase = token ? db(token) : null;
        let userId: string | null = null;
        if (supabase) {
          const { data } = await supabase.auth.getUser();
          userId = data.user?.id ?? null;
        }

        let extra = userId ? "" : "\nThe person is NOT signed in. For saving, filing or setup, tell them to sign in first and open /auth.";
        let onboardingDone = true;
        if (supabase && userId) {
          const [{ data: profile }, { data: contacts }] = await Promise.all([
            supabase.from("profiles").select("full_name, phone, location_mode, onboarding_step, onboarding_completed").eq("id", userId).maybeSingle(),
            supabase.from("emergency_contacts").select("name").eq("user_id", userId),
          ]);
          onboardingDone = Boolean(profile?.onboarding_completed);
          if (!onboardingDone) extra = onboardingBlock(Number(profile?.onboarding_step ?? 0), profile ?? null, contacts ?? []);
          else if (profile?.full_name) extra = `\nThe person's name is ${profile.full_name}.`;
        }

        const actions: Action[] = [];
        let onboardingChanged = false;
        const authed = () => (supabase && userId ? { supabase, userId } : null);
        const signIn = { ok: false, message: "Not signed in." };

        const tools = {
          app_action: tool({
            description: "Perform an app action on the person's device: open a page, go back, start SOS, request location permission, or exit voice mode.",
            inputSchema: z.object({
              action: z.enum(["navigate", "back", "sos", "exit", "request_location"]),
              path: z.string().nullable().describe("Page path for navigate, else null"),
            }),
            execute: async ({ action, path }) => {
              if (action === "navigate") {
                if (!path || !/^\/[a-z\-]*$/.test(path)) return { ok: false, message: "Unknown page." };
                actions.push({ type: "navigate", to: path });
              } else actions.push({ type: action });
              return { ok: true };
            },
          }),
          save_onboarding: tool({
            description: "Save confirmed onboarding answers and move to a step.",
            inputSchema: z.object({
              full_name: z.string().nullable(),
              phone: z.string().nullable(),
              location_mode: z.enum(["approximate", "exact-after-accept", "never"]).nullable(),
              health_reminders: z.boolean().nullable(),
              next_step: z.number().int(),
            }),
            execute: async ({ full_name, phone, location_mode, next_step }) => {
              const a = authed();
              if (!a) return signIn;
              const patch: Database["public"]["Tables"]["profiles"]["Update"] = {
                onboarding_step: Math.min(6, Math.max(0, next_step)),
              };
              if (full_name?.trim()) patch.full_name = full_name.trim().slice(0, 80);
              if (phone?.trim()) patch.phone = phone.trim().slice(0, 20);
              if (location_mode) patch.location_mode = location_mode;
              const { error } = await a.supabase.from("profiles").update(patch).eq("id", a.userId);
              if (error) return { ok: false, message: error.message };
              onboardingChanged = true;
              return { ok: true, step: patch.onboarding_step, step_name: STEPS[patch.onboarding_step!] };
            },
          }),
          add_emergency_contact: tool({
            description: "Add a confirmed trusted emergency contact.",
            inputSchema: z.object({ name: z.string(), phone: z.string(), relationship: z.string().nullable(), confirmed: z.boolean() }),
            execute: async ({ name, phone, relationship, confirmed }) => {
              const a = authed();
              if (!a) return signIn;
              if (!confirmed) return needsConfirm;
              const { error } = await a.supabase.from("emergency_contacts").insert({
                user_id: a.userId,
                name: name.trim().slice(0, 80),
                phone: phone.replace(/[^\d+]/g, "").slice(0, 20),
                relationship: relationship?.trim() || "Family",
              });
              if (error) return { ok: false, message: error.message };
              onboardingChanged = true;
              return { ok: true };
            },
          }),
          finish_onboarding: tool({
            description: "Mark setup complete after the person confirmed the summary.",
            inputSchema: z.object({ confirmed: z.boolean() }),
            execute: async ({ confirmed }) => {
              const a = authed();
              if (!a) return signIn;
              if (!confirmed) return needsConfirm;
              const { error } = await a.supabase.from("profiles").update({ onboarding_completed: true, onboarding_step: 6 }).eq("id", a.userId);
              if (error) return { ok: false, message: error.message };
              onboardingChanged = true;
              actions.push({ type: "navigate", to: "/" });
              return { ok: true };
            },
          }),
          create_report: tool({
            description: "File a confirmed non-emergency safety report (theft, missing person, lost item, suspicious activity, other).",
            inputSchema: z.object({
              title: z.string(),
              report_type: z.enum(["crime", "theft", "missing_person", "lost_found", "suspicious_activity", "other"]),
              narrative: z.string(),
              location_text: z.string().nullable(),
              district: z.string().nullable(),
              confirmed: z.boolean(),
            }),
            execute: async (input) => {
              const a = authed();
              if (!a) return signIn;
              if (!input.confirmed) return needsConfirm;
              const { data, error } = await a.supabase
                .from("reports")
                .insert({
                  user_id: a.userId,
                  title: input.title.trim().slice(0, 120),
                  report_type: input.report_type,
                  narrative: input.narrative.trim(),
                  summary: input.narrative.trim().slice(0, 280),
                  location_text: input.location_text?.trim() || null,
                  district: input.district?.trim() || null,
                })
                .select("reference, status")
                .maybeSingle();
              if (error) return { ok: false, message: error.message };
              return { ok: true, reference: data?.reference, status: data?.status };
            },
          }),
          list_my_reports: tool({
            description: "List the person's own recent reports with status.",
            inputSchema: z.object({}),
            execute: async () => {
              const a = authed();
              if (!a) return signIn;
              const { data, error } = await a.supabase.from("reports").select("reference, title, status, created_at").order("created_at", { ascending: false }).limit(5);
              if (error) return { ok: false, message: error.message };
              return { ok: true, reports: data ?? [] };
            },
          }),
          list_alerts: tool({
            description: "Read current published community safety alerts.",
            inputSchema: z.object({ area: z.string().nullable() }),
            execute: async ({ area }) => {
              if (!supabase) return signIn;
              let q = supabase.from("community_alerts").select("title, severity, area").eq("is_published", true).order("starts_at", { ascending: false }).limit(4);
              if (area) q = q.ilike("area", `%${area}%`);
              const { data, error } = await q;
              if (error) return { ok: false, message: error.message };
              return { ok: true, alerts: data ?? [] };
            },
          }),
          find_facilities: tool({
            description: "Find the nearest police stations, hospitals, fire stations or ambulance services to a named Ugandan area.",
            inputSchema: z.object({ facility_type: z.enum(["police", "hospital", "fire", "ambulance", "shelter"]), area: z.string().nullable() }),
            execute: async ({ facility_type, area }) => {
              if (!supabase) return signIn;
              const { data, error } = await supabase
                .from("facilities")
                .select("name, address, district, latitude, longitude")
                .eq("facility_type", facility_type)
                .limit(200);
              if (error) return { ok: false, message: error.message };
              const place = area ? resolveUgandaPlace(area) : null;
              if (!place) {
                const p = area?.toLowerCase();
                const rows = (data ?? []).filter((r) => !p || `${r.name} ${r.address} ${r.district}`.toLowerCase().includes(p)).slice(0, 3);
                return { ok: true, facilities: rows.map(({ name, address, district }) => ({ name, address, district })) };
              }
              const rad = (v: number) => (v * Math.PI) / 180;
              const ranked = (data ?? [])
                .filter((r) => r.latitude != null && r.longitude != null)
                .map((r) => {
                  const dLat = rad(Number(r.latitude) - place.lat);
                  const dLng = rad(Number(r.longitude) - place.lng);
                  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(place.lat)) * Math.cos(rad(Number(r.latitude))) * Math.sin(dLng / 2) ** 2;
                  return { name: r.name, address: r.address, distance_km: Math.round(12742 * Math.asin(Math.min(1, Math.sqrt(s))) * 10) / 10 };
                })
                .sort((x, y) => x.distance_km - y.distance_km)
                .slice(0, 3);
              return { ok: true, resolved_area: `${place.name}, ${place.district}`, facilities: ranked };
            },
          }),
        };

        const gateway = createLovableAiGatewayResponsesProvider(apiKey);
        try {
          const result = streamText({
            model: gateway.responses("openai/gpt-6-astra"),
            system: `${SYSTEM}${extra}\nThe person is currently on page: ${String(body.path ?? "/").slice(0, 80)}`,
            messages,
            tools,
            stopWhen: stepCountIs(50),
            abortSignal: request.signal,
            providerOptions: {
              openai: {
                forceReasoning: true,
                reasoningEffort: "low",
                reasoningSummary: "auto",
                store: false,
                include: ["reasoning.encrypted_content"],
              },
            },
          });
          const text = await result.text;
          return Response.json({ text, actions, onboardingChanged, onboarding: !onboardingDone });
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 429) return new Response("Allma is busy. Please try again in a moment.", { status: 429 });
          if (status === 402) return new Response("AI credits have run out for this workspace.", { status: 402 });
          if (request.signal.aborted) return new Response(null, { status: 499 });
          console.error("[voice-assistant]", error);
          return new Response("Allma could not answer right now.", { status: 502 });
        }
      },
    },
  },
});
