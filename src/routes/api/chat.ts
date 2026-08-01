import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, tool, type UIMessage } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ALLMA_SYSTEM_PROMPT } from "@/lib/allma-prompt";
import {
  createLovableAiGatewayProvider,
  getLovableAiGatewayResponseHeaders,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "@/lib/ai-gateway.server";

type ChatRequestBody = {
  messages?: unknown;
  threadId?: string | null;
};

function isNewSupabaseApiKey(value: string) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function supabaseFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (isNewSupabaseApiKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

function createSupabase(accessToken?: string) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    global: {
      fetch: supabaseFetch(key),
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

function textOf(message: UIMessage) {
  return message.parts
    .map((part) => ("text" in part && typeof part.text === "string" ? part.text : ""))
    .join(" ")
    .trim();
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as ChatRequestBody;
        const messages = body.messages;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return new Response("AI is not configured yet.", { status: 500 });
        }

        const accessToken =
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || undefined;
        const supabase = createSupabase(accessToken);

        let userId: string | null = null;
        if (accessToken) {
          const { data } = await supabase.auth.getUser();
          userId = data.user?.id ?? null;
        }

        const threadId = userId && body.threadId ? body.threadId : null;

        const initialRunId = getLovableAiGatewayRunId(request);
        const gateway = createLovableAiGatewayProvider(apiKey, initialRunId);

        const uiMessages = messages as UIMessage[];

        let memoryBlock = "";
        if (userId) {
          const { data: memoryRows } = await supabase
            .from("ai_user_memory")
            .select("kind, key, value")
            .eq("user_id", userId)
            .order("updated_at", { ascending: false })
            .limit(30);
          if (memoryRows && memoryRows.length > 0) {
            memoryBlock = `\n\nWHAT YOU ALREADY KNOW ABOUT THIS USER (do not re-ask these):\n${memoryRows
              .map((row) => `- ${row.key} (${row.kind}): ${row.value}`)
              .join("\n")}`;
          }
        }

        const modelMessages = await convertToModelMessages(uiMessages);

        const buildStream = (modelId: string) => streamText({
          model: gateway(modelId),
          system: `${ALLMA_SYSTEM_PROMPT}\n\nThe user is ${
            userId ? "signed in, so reports can be filed." : "NOT signed in. You can still help and give guidance, but if they want a report filed, tell them to sign in first so their report is saved to their account."
          }${memoryBlock}`,
          messages: modelMessages,
          stopWhen: stepCountIs(50),


          tools: {
            suggest_replies: tool({
              description:
                "Offer 2-4 short, tappable follow-up suggestions that fit EXACTLY what you just said. Call this at the very end of a turn. Suggestions must be answers or next steps for the current step of the conversation — never a generic menu. Do NOT call this in the same turn as ask_structured_question (that card already shows options).",
              inputSchema: z.object({
                suggestions: z.array(
                  z.object({
                    label: z.string().describe("Short chip label, max ~24 characters"),
                    prompt: z.string().describe("Exact text to send as the user's message when tapped"),
                  }),
                ),
              }),
              execute: async (input) => ({ ok: true, ...input }),
            }),
            ask_structured_question: tool({
              description:
                "Ask the user one structured question at a time with tappable options. Use during guided reporting flows so the user can pick an answer instead of typing. After the user picks, continue the conversation based on their answer.",
              inputSchema: z.object({
                step: z.number().describe("Current step number, e.g. 2"),
                total_steps: z.number().describe("Total number of steps in the flow, e.g. 7"),
                question: z.string().describe("The single question to ask the user"),
                options: z
                  .array(
                    z.object({
                      label: z.string().describe("Human-readable option label"),
                      value: z.string().describe("Value to treat as the user's answer when selected"),
                    }),
                  )
                  .describe("Tappable answer options"),
                helper_text: z
                  .string()
                  .nullable()
                  .describe("Optional short helper text shown below the question"),
              }),
              execute: async (input) => ({ ok: true, ...input }),
            }),
            request_media: tool({
              description:
                "Ask the user to upload a photo, video, audio, document or location. Use when evidence would help the report. The UI will show an upload card. If optional, the user can skip.",
              inputSchema: z.object({
                media_type: z
                  .enum(["photo", "video", "audio", "document", "location"])
                  .describe("Type of media requested"),
                prompt: z
                  .string()
                  .describe("Friendly message asking for the media, e.g. 'Do you have a photo of the phone?'"),
                optional: z.boolean().describe("Whether the user can skip this request"),
              }),
              execute: async (input) => ({ ok: true, ...input }),
            }),
            recommend_actions: tool({
              description:
                "Show a card of recommended next actions the user can tap. Use after detecting a case type to suggest practical steps (e.g. Block SIM, Call Police, Track IMEI).",
              inputSchema: z.object({
                title: z.string().describe("Title of the recommendations card"),
                actions: z.array(
                  z.object({
                    label: z.string().describe("Short action label"),
                    subtitle: z.string().describe("One-line explanation of the action"),
                    icon: z
                      .enum([
                        "phone",
                        "upload",
                        "location",
                        "block",
                        "report",
                        "search",
                        "ambulance",
                        "police",
                        "money",
                        "shield",
                        "sim",
                      ])
                      .optional()
                      .describe("Optional icon key for the action"),
                  }),
                ),
              }),
              execute: async (input) => ({ ok: true, ...input }),
            }),
            report_summary: tool({
              description:
                "Show a review card with all collected report details before filing. Use this AFTER collecting all details and BEFORE calling create_report. The user can confirm or ask to edit. Once confirmed, call create_report with the same fields.",
              inputSchema: z.object({
                report_type: z.enum([
                  "crime",
                  "emergency",
                  "missing_person",
                  "lost_item",
                  "found_item",
                  "other",
                ]),
                category: z.string().describe("Specific category"),
                title: z.string().describe("Short headline"),
                summary: z.string().describe("Two-sentence summary"),
                narrative: z.string().describe("Full narrative"),
                occurred_at_text: z.string().nullable(),
                location_text: z.string().nullable(),
                risk_level: z.enum(["low", "medium", "high", "critical"]),
                is_anonymous: z.boolean(),
                contact_name: z.string().nullable(),
                contact_phone: z.string().nullable(),
                extra_details_json: z.string().nullable(),
              }),
              execute: async (input) => ({ ok: true, ...input }),
            }),
            create_report: tool({
              description:
                "File a structured incident report after the user confirms. Use for crime, emergency, missing person, lost item or found item reports.",
              inputSchema: z.object({
                report_type: z.enum([
                  "crime",
                  "emergency",
                  "missing_person",
                  "lost_item",
                  "found_item",
                  "other",
                ]),
                category: z
                  .string()
                  .describe("Specific category, e.g. theft, robbery, fire, phone, national ID"),
                title: z.string().describe("Short headline for the report"),
                summary: z.string().describe("Two-sentence professional summary"),
                narrative: z
                  .string()
                  .describe("Full structured report narrative written in clear professional English"),
                occurred_at_text: z
                  .string()
                  .nullable()
                  .describe("When it happened, in the user's own words"),
                location_text: z.string().nullable(),
                risk_level: z.enum(["low", "medium", "high", "critical"]),
                is_anonymous: z.boolean(),
                contact_name: z.string().nullable(),
                contact_phone: z.string().nullable(),
                extra_details_json: z
                  .string()
                  .nullable()
                  .describe(
                    "Optional JSON object string with type-specific fields collected in the conversation",
                  ),
              }),
              execute: async (input) => {
                if (!userId) {
                  return {
                    ok: false,
                    message: "The user must sign in before a report can be saved.",
                  };
                }

                let details: Record<string, unknown> = {};
                if (input.extra_details_json) {
                  try {
                    const parsed = JSON.parse(input.extra_details_json);
                    if (parsed && typeof parsed === "object") details = parsed;
                  } catch {
                    details = { notes: input.extra_details_json };
                  }
                }
                if (input.occurred_at_text) details.occurred_at_text = input.occurred_at_text;

                const { data, error } = await supabase
                  .from("reports")
                  .insert({
                    user_id: userId,
                    thread_id: threadId,
                    report_type: input.report_type,
                    category: input.category,
                    title: input.title.slice(0, 160),
                    summary: input.summary,
                    narrative: input.narrative,
                    details: details as never,
                    location_text: input.location_text,
                    risk_level: input.risk_level,
                    is_anonymous: input.is_anonymous,
                    contact_name: input.contact_name,
                    contact_phone: input.contact_phone,
                  })
                  .select("id, reference, report_type, title, status, risk_level")
                  .single();

                if (error) {
                  console.error("create_report failed", error);
                  return { ok: false, message: "The report could not be saved. Please try again." };
                }

                return { ok: true, ...data };
              },
            }),
            find_facilities: tool({
              description:
                "Find nearby help: police stations, hospitals, fire stations, ambulance services or safe shelters.",
              inputSchema: z.object({
                facility_type: z.enum(["police", "hospital", "fire", "ambulance", "shelter"]),
                area: z.string().nullable().describe("Optional district or area name"),
              }),
              execute: async ({ facility_type, area }) => {
                let query = supabase
                  .from("facilities")
                  .select("name, facility_type, phone, address, district, latitude, longitude")
                  .eq("facility_type", facility_type)
                  .limit(5);
                if (area) query = query.ilike("district", `%${area}%`);
                const { data, error } = await query;
                if (error) return { ok: false, message: "Directory lookup failed." };
                return { ok: true, facilities: data ?? [] };
              },
            }),
            list_alerts: tool({
              description: "List current verified community safety alerts.",
              inputSchema: z.object({
                area: z.string().nullable(),
              }),
              execute: async ({ area }) => {
                let query = supabase
                  .from("community_alerts")
                  .select("title, body, alert_type, severity, area, starts_at")
                  .eq("is_published", true)
                  .order("starts_at", { ascending: false })
                  .limit(6);
                if (area) query = query.ilike("area", `%${area}%`);
                const { data, error } = await query;
                if (error) return { ok: false, message: "Alerts lookup failed." };
                return { ok: true, alerts: data ?? [] };
              },
            }),
            remember: tool({
              description:
                "Store a durable fact about this user so future conversations don't start from scratch. Use for home district/area, landmark, preferred language, emergency contact name and phone, and whether they prefer anonymous reporting. Never store sensitive incident details here.",
              inputSchema: z.object({
                key: z
                  .string()
                  .describe("Short snake_case key, e.g. home_district, emergency_contact_phone"),
                value: z.string().describe("The value to remember, in plain text"),
                kind: z
                  .enum(["profile", "preference", "contact", "fact"])
                  .describe("Category of the memory"),
              }),
              execute: async ({ key, value, kind }) => {
                if (!userId) return { ok: false, message: "User is not signed in." };
                const { error } = await supabase
                  .from("ai_user_memory")
                  .upsert(
                    { user_id: userId, key: key.slice(0, 80), value: value.slice(0, 500), kind },
                    { onConflict: "user_id,key" },
                  );
                if (error) {
                  console.error("remember failed", error);
                  return { ok: false, message: "Could not save that detail." };
                }
                return { ok: true, key, value };
              },
            }),
            recall_history: tool({
              description:
                "Search this user's earlier conversations for context, e.g. 'the phone I reported last week'. Returns matching message snippets.",
              inputSchema: z.object({
                query: z.string().describe("Keyword or phrase to search for"),
              }),
              execute: async ({ query }) => {
                if (!userId) return { ok: false, message: "User is not signed in." };
                const { data, error } = await supabase
                  .from("messages")
                  .select("role, parts, created_at, thread_id")
                  .eq("user_id", userId)
                  .order("created_at", { ascending: false })
                  .limit(200);
                if (error) return { ok: false, message: "History lookup failed." };
                const needle = query.toLowerCase();
                const matches = (data ?? [])
                  .map((row) => {
                    const parts = Array.isArray(row.parts) ? row.parts : [];
                    const text = parts
                      .map((part) =>
                        part && typeof part === "object" && "text" in part
                          ? String((part as { text?: unknown }).text ?? "")
                          : "",
                      )
                      .join(" ")
                      .trim();
                    return { role: row.role, created_at: row.created_at, text };
                  })
                  .filter((row) => row.text.toLowerCase().includes(needle))
                  .slice(0, 6)
                  .map((row) => ({ ...row, text: row.text.slice(0, 300) }));
                return { ok: true, matches };
              },
            }),
            save_draft: tool({
              description:
                "Save an unfinished reporting flow so the user can resume it later. Call this when the user pauses, leaves, or says they will come back.",
              inputSchema: z.object({
                flow: z.string().describe("Flow name, e.g. crime, missing_person, lost_item"),
                step: z.number().describe("Current step number"),
                total_steps: z.number().describe("Total steps in the flow"),
                collected_json: z
                  .string()
                  .describe("JSON object string of everything collected so far"),
              }),
              execute: async (input) => {
                if (!userId || !threadId)
                  return { ok: false, message: "No active saved conversation." };
                let collected: unknown = {};
                try {
                  collected = JSON.parse(input.collected_json);
                } catch {
                  collected = { notes: input.collected_json };
                }
                const { error } = await supabase
                  .from("threads")
                  .update({
                    draft_data: {
                      flow: input.flow,
                      step: input.step,
                      total_steps: input.total_steps,
                      collected,
                      saved_at: new Date().toISOString(),
                    } as never,
                  })
                  .eq("id", threadId)
                  .eq("user_id", userId);
                if (error) {
                  console.error("save_draft failed", error);
                  return { ok: false, message: "Could not save the draft." };
                }
                return { ok: true, flow: input.flow, step: input.step };
              },
            }),
            get_draft: tool({
              description:
                "Load the most recent unfinished reporting flow for this user so it can be resumed instead of restarted.",
              inputSchema: z.object({}),
              execute: async () => {
                if (!userId) return { ok: false, message: "User is not signed in." };
                const { data, error } = await supabase
                  .from("threads")
                  .select("id, title, draft_data, updated_at")
                  .eq("user_id", userId)
                  .not("draft_data", "is", null)
                  .order("updated_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                if (error) return { ok: false, message: "Draft lookup failed." };
                if (!data) return { ok: true, draft: null };
                return { ok: true, draft: data.draft_data, thread_title: data.title };
              },
            }),
            my_reports: tool({
              description:
                "Look up the reports this user has already filed, optionally by reference number, so you can tell them the current status directly in chat.",
              inputSchema: z.object({
                reference: z
                  .string()
                  .nullable()
                  .describe("Optional report reference like ALM-1A2B3C4D"),
              }),
              execute: async ({ reference }) => {
                if (!userId) return { ok: false, message: "User is not signed in." };
                let query = supabase
                  .from("reports")
                  .select("reference, title, report_type, status, risk_level, created_at")
                  .eq("user_id", userId)
                  .order("created_at", { ascending: false })
                  .limit(5);
                if (reference) query = query.ilike("reference", `%${reference.trim()}%`);
                const { data, error } = await query;
                if (error) return { ok: false, message: "Report lookup failed." };
                return { ok: true, reports: data ?? [] };
              },
            }),
            match_reports: tool({
              description:
                "Find possible matches between lost and found reports in the same area, e.g. a lost phone reported by someone and a found phone nearby. Use after filing a lost or found item report.",
              inputSchema: z.object({
                looking_for: z
                  .enum(["lost_item", "found_item"])
                  .describe("Which report type to search for"),
                keyword: z.string().describe("Item keyword, e.g. phone, national ID, wallet"),
                area: z.string().nullable().describe("Optional area or district"),
              }),
              execute: async ({ looking_for, keyword, area }) => {
                if (!userId) return { ok: false, message: "User is not signed in." };
                let query = supabase
                  .from("reports")
                  .select("reference, title, category, location_text, created_at")
                  .eq("user_id", userId)
                  .eq("report_type", looking_for)
                  .ilike("title", `%${keyword}%`)
                  .order("created_at", { ascending: false })
                  .limit(5);
                if (area) query = query.ilike("location_text", `%${area}%`);
                const { data, error } = await query;
                if (error) return { ok: false, message: "Match lookup failed." };
                return { ok: true, matches: data ?? [] };
              },
            }),
          },
        });

        const CHAT_MODELS = [
          "google/gemini-3.6-flash",
          "google/gemini-2.5-flash",
          "openai/gpt-5.6-luna",
        ];

        let result: ReturnType<typeof buildStream> | null = null;
        let usedModel = CHAT_MODELS[0];
        for (const modelId of CHAT_MODELS) {
          const attempt = buildStream(modelId);
          try {
            await attempt.warnings;
            result = attempt;
            usedModel = modelId;
            break;
          } catch (error) {
            console.error(`Model ${modelId} unavailable, trying fallback`, error);
          }
        }
        if (!result) {
          return new Response("The assistant is busy right now. Please try again.", {
            status: 503,
          });
        }

        const response = result.toUIMessageStreamResponse({

          originalMessages: uiMessages,
          onFinish: async ({ responseMessage }) => {
            if (!userId || !threadId) return;

            const lastUserMessage = [...uiMessages].reverse().find((m) => m.role === "user");
            const rows: Database["public"]["Tables"]["messages"]["Insert"][] = [];

            if (lastUserMessage) {
              rows.push({
                thread_id: threadId,
                user_id: userId,
                role: "user",
                parts: lastUserMessage.parts as never,
                sdk_message_id: lastUserMessage.id,
              });
            }
            rows.push({
              thread_id: threadId,
              user_id: userId,
              role: responseMessage.role,
              parts: responseMessage.parts as never,
              sdk_message_id: responseMessage.id,
            });

            const { error } = await supabase.from("messages").insert(rows);
            if (error) console.error("Failed to persist messages", error);

            const title = lastUserMessage ? textOf(lastUserMessage).slice(0, 60) : null;
            const { error: threadError } = await supabase
              .from("threads")
              .update({ updated_at: new Date().toISOString(), ...(title ? { title } : {}) })
              .eq("id", threadId)
              .eq("title", "New conversation");
            if (threadError) console.error("Failed to update thread", threadError);

            const { error: touchError } = await supabase
              .from("threads")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", threadId);
            if (touchError) console.error("Failed to touch thread", touchError);
          },
          headers: getLovableAiGatewayResponseHeaders(undefined, {
            ...(initialRunId ? { "X-Lovable-AIG-Run-ID": initialRunId } : {}),
            "X-Allma-Model": usedModel,
          }),

        });

        return withLovableAiGatewayRunIdHeader(response, gateway);
      },
    },
  },
});
