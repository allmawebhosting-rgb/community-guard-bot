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
  /** Storage paths of evidence uploaded during this conversation. */
  evidence?: unknown;
};

function parseEvidence(value: unknown): Array<{ path: string; mediaType: string | null }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is { path: string; mediaType?: unknown } =>
        !!item && typeof item === "object" && typeof (item as { path?: unknown }).path === "string",
    )
    .slice(0, 20)
    .map((item) => ({
      path: item.path,
      mediaType: typeof item.mediaType === "string" ? item.mediaType : null,
    }));
}


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
        const evidence = parseEvidence(body.evidence);


        const initialRunId = getLovableAiGatewayRunId(request);
        const gateway = createLovableAiGatewayProvider(apiKey, initialRunId);

        const uiMessages = messages as UIMessage[];
        const lastUserMessage = [...uiMessages].reverse().find((m) => m.role === "user");
        const intakeText = lastUserMessage ? textOf(lastUserMessage) : "";

        if (userId && intakeText) {
          const normalized = intakeText.toLowerCase();
          const severity =
            /sos|immediate danger|attack|assault|gunshot|fire|ambulance|accident/.test(normalized)
              ? "critical"
              : /robbery|missing|stolen|theft|crime/.test(normalized)
                ? "high"
                : "info";
          const { error: activityError } = await supabase.from("safety_activity").insert({
            user_id: userId,
            activity_type: "ai_intake",
            title: "AI safety intake received",
            summary: intakeText.slice(0, 1000),
            severity,
            report_id: null,
            details: {
              channel: "allma_ai",
              thread_id: threadId,
              has_attachments: lastUserMessage?.parts.some((part) => part.type === "file") ?? false,
            } as never,
          });
          if (activityError) console.error("Failed to record AI intake activity", activityError);
        }

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

        // ---- Guided flow state, derived from the thread (not from the model) ----
        // The model re-declares flow_label / step / total_steps on every turn, which
        // lets it repeat or rewind a step. We keep the authoritative counter here so
        // the banner only ever moves forward and the flow name stays fixed.
        type StepOutput = {
          flow_label?: string;
          step_title?: string;
          step?: number;
          total_steps?: number;
        };
        const priorSteps: StepOutput[] = [];
        for (const message of uiMessages) {
          for (const part of message.parts as Array<{ type: string; output?: unknown }>) {
            if (part.type === "tool-ask_structured_question" && part.output) {
              priorSteps.push(part.output as StepOutput);
            }
          }
        }
        const lastStep = priorSteps[priorSteps.length - 1];
        const flowState = {
          cardIssued: false,
          flowLabel: lastStep?.flow_label ?? null as string | null,
          step: typeof lastStep?.step === "number" ? lastStep.step : 0,
          totalSteps: typeof lastStep?.total_steps === "number" ? lastStep.total_steps : 0,
          askedTitles: priorSteps
            .map((s) => (s.step_title ?? "").trim().toLowerCase())
            .filter(Boolean),
        };
        const flowBlock = flowState.flowLabel
          ? `\n\nACTIVE GUIDED FLOW: "${flowState.flowLabel}", currently at step ${flowState.step} of ${flowState.totalSteps || "?"}. Steps already asked: ${
              flowState.askedTitles.join(", ") || "none"
            }. Ask the NEXT thing only — never repeat a step already asked, never announce step numbers in your text, and never ask two things in one turn.`
          : "";

        // ---- Coordinates the user already shared (from "My current location is: lat, lng")
        const coordMatch = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/.exec(intakeText);
        const sharedCoords = coordMatch
          ? { latitude: Number(coordMatch[1]), longitude: Number(coordMatch[2]) }
          : null;
        const coordBlock = sharedCoords
          ? `\n\nTHE USER HAS ALREADY SHARED THEIR GPS LOCATION: latitude ${sharedCoords.latitude}, longitude ${sharedCoords.longitude}. Call location_intelligence immediately with these latitude and longitude values. Do NOT ask them for an area, landmark or district again.`
          : "";

        // ---- Named intent: the reply must open that flow with a step card.
        const INTENTS: Array<{ matches: RegExp; flow: string; opener: string }> = [
          { matches: /\blost\b|\bfound\b|misplac/i, flow: "Lost & found", opener: 'Did you lose something or find something? Options: "I lost something", "I found something".' },
          { matches: /missing person|missing child|can'?t find (my|our)\s+\w+|disappeared/i, flow: "Missing person", opener: 'Is the missing person an adult or a child? Options: "An adult", "A child".' },
          { matches: /sos|immediate danger|being attacked|help me now/i, flow: "Safety check", opener: 'Are you safe right now? Options: "Yes, I\'m safe", "No, I\'m in danger", "I\'m not sure".' },
          { matches: /report (a )?(crime|theft|robbery|assault|burglar|fraud)|stolen|theft|robb|assault/i, flow: "Reporting", opener: 'What kind of incident is this? Options: "Theft", "Robbery", "Assault", "Something else".' },
          { matches: /find help|near me|nearest|police station|hospital|ambulance|fire station/i, flow: "Find help", opener: 'Which service do you need? Options: "Police station", "Hospital", "Fire station".' },
        ];
        const intent = INTENTS.find((i) => i.matches.test(intakeText));
        const intentBlock = intent
          ? `\n\nTHE USER NAMED AN INTENT: ${intent.flow}. ${
              flowState.flowLabel
                ? "The flow is already running — ask the NEXT step with ask_structured_question."
                : `Open the "${intent.flow}" flow in THIS turn by calling ask_structured_question with flow_label "${intent.flow}", step 1 and this opening question: ${intent.opener}`
            } Do NOT ask this as plain prose without options, do NOT greet or introduce yourself, and stay strictly on this subject: never offer unrelated actions (emergency numbers, find help nearby, generate report) while this flow is running.`
          : "";

        // ---- Anti-repeat guard: the model must not restate its previous message.
        const lastAssistant = [...uiMessages].reverse().find((m) => m.role === "assistant");
        const lastAssistantText = lastAssistant ? textOf(lastAssistant).slice(0, 400) : "";
        const repeatBlock = lastAssistantText
          ? `\n\nYOUR PREVIOUS MESSAGE IN THIS CONVERSATION WAS: "${lastAssistantText}". Never repeat it or re-introduce yourself. Move the conversation forward instead.`
          : "";


        const modelMessages = await convertToModelMessages(uiMessages);


        const buildStream = (modelId: string) => streamText({
          model: gateway(modelId),
          system: `${ALLMA_SYSTEM_PROMPT}\n\nThe user is ${
            userId ? "signed in, so reports can be filed." : "NOT signed in. You can still help and give guidance, but if they want a report filed, tell them to sign in first so their report is saved to their account."
          }${memoryBlock}${flowBlock}${coordBlock}${intentBlock}${repeatBlock}`,


          messages: modelMessages,
          stopWhen: stepCountIs(50),
          ...(modelId.startsWith("openai/gpt-5.6")
            ? { providerOptions: { lovable: { reasoningEffort: "none" as const } } }
            : {}),




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
                "Ask the user one structured question at a time with tappable options. Use during guided reporting flows so the user can pick an answer instead of typing. Renders a slim flow banner (flow label, step counter, step title, progress bar) and shows the options as tappable chips under your reply. After the user picks, continue the conversation based on their answer.",
              inputSchema: z.object({
                flow_label: z
                  .string()
                  .describe("Short uppercase-ish flow name shown in the banner, e.g. 'Reporting', 'Missing person', 'Lost & found', 'Safety check'"),
                step_title: z
                  .string()
                  .describe("Short title of this step shown in the banner, e.g. 'Add photos', 'Where did it happen?'"),
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
              execute: async (input) => {
                if (flowState.cardIssued) {
                  return {
                    ok: false,
                    suppressed: true,
                    reason:
                      "You already showed an interactive card this turn. Ask one thing at a time — wait for the user's answer.",
                  };
                }
                const startingNewFlow =
                  !flowState.flowLabel ||
                  (input.step <= 1 && input.flow_label.trim() !== flowState.flowLabel);
                if (startingNewFlow) {
                  flowState.flowLabel = input.flow_label.trim();
                  flowState.step = 0;
                  flowState.totalSteps = 0;
                  flowState.askedTitles = [];
                }
                const title = input.step_title.trim();
                const repeated = flowState.askedTitles.includes(title.toLowerCase());
                const step = repeated ? Math.max(flowState.step, 1) : flowState.step + 1;
                const totalSteps = Math.max(flowState.totalSteps, input.total_steps, step);
                flowState.step = step;
                flowState.totalSteps = totalSteps;
                flowState.cardIssued = true;
                if (!repeated) flowState.askedTitles.push(title.toLowerCase());

                const options = input.options
                  .filter((option) => option.label.trim().length > 0)
                  .slice(0, 5)
                  .map((option) => ({
                    label:
                      option.label.trim().length > 26
                        ? `${option.label.trim().slice(0, 25)}…`
                        : option.label.trim(),
                    value: option.value.trim() || option.label.trim(),
                  }));

                return {
                  ok: true,
                  ...input,
                  flow_label: flowState.flowLabel ?? input.flow_label,
                  step_title: title,
                  step,
                  total_steps: totalSteps,
                  options,
                };
              },

            }),
            request_media: tool({
              description:
                "Ask the user to upload a photo, video, audio, document or location. Use when evidence would help the report. The UI shows a single tap-to-attach card. If optional, the user can skip.",
              inputSchema: z.object({
                media_type: z
                  .enum(["photo", "video", "audio", "document", "location"])
                  .describe("Type of media requested"),
                prompt: z
                  .string()
                  .describe("Friendly message asking for the media, e.g. 'Do you have a photo of the phone?'"),
                tips: z
                  .string()
                  .nullable()
                  .describe("Optional one-line tips separated by ' · ', e.g. 'Good light · Show the whole scene · Up to 4 photos'"),
                optional: z.boolean().describe("Whether the user can skip this request"),
              }),
              execute: async (input) => {
                if (flowState.cardIssued) {
                  return {
                    ok: false,
                    suppressed: true,
                    reason:
                      "You already asked a question this turn. Request media on its own turn, after the user answers.",
                  };
                }
                flowState.cardIssued = true;
                return { ok: true, ...input };
              },

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

                 const { error: activityError } = await supabase.from("safety_activity").insert({
                   user_id: userId,
                   activity_type: "report_submitted",
                   title: "Incident report submitted",
                   summary: input.title.slice(0, 1000),
                   severity: input.risk_level,
                   report_id: data.id,
                   location_text: input.location_text,
                   details: {
                     channel: "allma_ai",
                     report_type: input.report_type,
                     category: input.category,
                     reference: data.reference,
                   } as never,
                 });
                 if (activityError) console.error("Failed to record report activity", activityError);

                // Attach the photos and files uploaded in this conversation to the report
                // so the evidence survives outside the chat transcript.
                if (evidence.length) {
                  const { error: evidenceError } = await supabase.from("report_evidence").insert(
                    evidence.map((item) => ({
                      report_id: data.id,
                      user_id: userId,
                      storage_path: item.path,
                      media_type: item.mediaType,
                    })),
                  );
                  if (evidenceError) console.error("Failed to link evidence", evidenceError);
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
            location_intelligence: tool({
              description:
                "Use the moment a location, area, district or GPS coordinate pair is known. With latitude/longitude it returns the CLOSEST police station, hospital and fire station ranked by real straight-line distance from Allma's facility directory. Without coordinates it matches the area name. Returns only real directory data — never estimated arrival times.",
              inputSchema: z.object({
                area: z.string().describe("The area, district, landmark, or location mentioned by the user. Use 'shared GPS location' when only coordinates are known."),
                incident_type: z.string().describe("Type of incident: crime, emergency, fire, medical, missing_person, etc."),
                latitude: z.number().optional().describe("Latitude the user shared, if any."),
                longitude: z.number().optional().describe("Longitude the user shared, if any."),
              }),
              execute: async ({ area, incident_type, latitude, longitude }) => {
                const cleaned = area.trim();
                const hasCoords =
                  typeof latitude === "number" &&
                  typeof longitude === "number" &&
                  Number.isFinite(latitude) &&
                  Number.isFinite(longitude);

                type Facility = {
                  name: string;
                  facility_type: string;
                  phone: string | null;
                  address: string | null;
                  district: string | null;
                  is_24_7: boolean;
                  latitude?: number | null;
                  longitude?: number | null;
                  distance_km?: number;
                  matched_on?: string;
                };

                if (hasCoords) {
                  const { data } = await supabase
                    .from("facilities")
                    .select("name, facility_type, phone, address, district, is_24_7, latitude, longitude")
                    .not("latitude", "is", null)
                    .not("longitude", "is", null);

                  const km = (aLat: number, aLng: number, bLat: number, bLng: number) => {
                    const R = 6371;
                    const dLat = ((bLat - aLat) * Math.PI) / 180;
                    const dLng = ((bLng - aLng) * Math.PI) / 180;
                    const s =
                      Math.sin(dLat / 2) ** 2 +
                      Math.cos((aLat * Math.PI) / 180) *
                        Math.cos((bLat * Math.PI) / 180) *
                        Math.sin(dLng / 2) ** 2;
                    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
                  };

                  const ranked = (data ?? [])
                    .map((row) => ({
                      ...(row as Facility),
                      distance_km:
                        Math.round(
                          km(latitude!, longitude!, row.latitude as number, row.longitude as number) *
                            10,
                        ) / 10,
                    }))
                    .sort((a, b) => a.distance_km - b.distance_km);

                  const nearest = (type: string) =>
                    ranked.find((row) => row.facility_type === type) ?? null;

                  const policeStation = nearest("police");
                  const hospital = nearest("hospital");
                  const fireStation = nearest("fire");
                  const found = [policeStation, hospital, fireStation].filter(Boolean).length;

                  return {
                    ok: true,
                    area: cleaned || "your shared location",
                    incident_type,
                    coordinates: { latitude, longitude },
                    police_station: policeStation,
                    hospital,
                    fire_station: fireStation,
                    nearby_police: ranked.filter((r) => r.facility_type === "police").slice(0, 3),
                    directory_note:
                      found === 0
                        ? "Allma's directory has no facilities with coordinates yet. Tell the user honestly and give the national numbers (Police 999, Emergency 112, Ambulance 911)."
                        : "distance_km is a real straight-line distance in kilometres — you may state it. Never state travel or arrival time.",
                  };
                }

                const terms = Array.from(
                  new Set(
                    [cleaned, ...cleaned.split(/[,/·]|\s+near\s+|\s+/i)]
                      .map((t) => t.replace(/[^\p{L}\p{N}\s'-]/gu, "").trim())
                      .filter((t) => t.length >= 3),
                  ),
                ).slice(0, 6);

                const lookup = async (facilityType: string): Promise<Facility | null> => {
                  for (const term of terms) {
                    const pattern = `%${term}%`;
                    const { data } = await supabase
                      .from("facilities")
                      .select("name, facility_type, phone, address, district, is_24_7")
                      .eq("facility_type", facilityType)
                      .or(
                        `district.ilike.${pattern},name.ilike.${pattern},address.ilike.${pattern}`,
                      )
                      .limit(1);
                    if (data && data.length > 0) return { ...(data[0] as Facility), matched_on: term };
                  }
                  return null;
                };

                const [policeStation, hospital, fireStation] = await Promise.all([
                  lookup("police"),
                  lookup("hospital"),
                  lookup("fire"),
                ]);

                const found = [policeStation, hospital, fireStation].filter(Boolean).length;

                return {
                  ok: true,
                  area: cleaned,
                  incident_type,
                  police_station: policeStation,
                  hospital,
                  fire_station: fireStation,
                  directory_note:
                    found === 0
                      ? `No facilities for "${cleaned}" are in Allma's directory yet. Tell the user honestly, give the national numbers (Police 999, Emergency 112, Ambulance 911), and continue helping. If they can share their GPS location, call location_intelligence again with latitude and longitude for the closest station.`
                      : "Only share the facility details returned here. Do not state distances or arrival times — they are not known.",
                };
              },
            }),


            case_timeline: tool({
              description:
                "Show a timestamped case progress timeline after major milestones — location received, evidence uploaded, AI summary generated, report submitted. Call this to give the user a sense of progress. Pass ALL events collected so far each time.",
              inputSchema: z.object({
                events: z.array(
                  z.object({
                    label: z.string().describe("What happened, e.g. 'Location received', 'Evidence uploaded'"),
                  }),
                ).describe("All timeline events so far, in chronological order"),
              }),
              execute: async (input) => ({
                ok: true,
                events: input.events,
                generated_at: new Date().toISOString(),
              }),
            }),
          },
        });

        const CHAT_MODELS = [
          "google/gemini-3.6-flash",
          "google/gemini-2.5-flash",
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

