import { classifyEmergency, classifyIncident, emergencyPromptBlock } from "@/lib/emergency-triage";
import { facilityKind } from "@/lib/facility-kind";
import { cleanAddress } from "@/lib/facility-results";
import { chooseSearchOrigin } from "@/lib/location-origin";
import { CF_CHAT_MODEL, getCloudflareChatModel } from "@/lib/cloudflare-ai.server";
import { getGatewayFailure, selectChatStream } from "@/lib/ai-gateway-errors";
import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  stepCountIs,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  ALLMA_CORE_PROMPT,
  ALLMA_DETAIL_BLOCK,
  ALLMA_LOCATION_BLOCK,
  ALLMA_MEMORY_BLOCK,
  ALLMA_ONBOARDING_BLOCK,
  ALLMA_PROCEDURES_BLOCK,
  ALLMA_REPORTING_BLOCK,
} from "@/lib/allma-prompt";
import { ALLMA_MARKER_CONTRACT, parseAllmaMarkers } from "@/lib/allma-markers";


import {
  createLovableAiGatewayProvider,
  createLovableAiGatewayResponsesProvider,
  getLovableAiGatewayResponseHeaders,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "@/lib/ai-gateway.server";

type ChatRequestBody = {
  messages?: unknown;
  threadId?: string | null;
  /** Storage paths of evidence uploaded during this conversation. */
  evidence?: unknown;
  /** Device GPS the browser attached to this request, if permitted. */
  coords?: { latitude?: unknown; longitude?: unknown } | null;
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

        const cfModel = getCloudflareChatModel();
        const apiKey = process.env.LOVABLE_API_KEY ?? "";
        if (!cfModel && !apiKey) {
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
        const responsesGateway = createLovableAiGatewayResponsesProvider(apiKey, initialRunId);

        const uiMessages = messages as UIMessage[];
        const lastUserMessage = [...uiMessages].reverse().find((m) => m.role === "user");
        const intakeText = lastUserMessage ? textOf(lastUserMessage) : "";
        // Everything the user typed in this conversation — a place counts as "named" only if it's here.
        const userConversationText = uiMessages.filter((m) => m.role === "user").map((m) => textOf(m)).join("\n");

        // ---- Greeting-only opener: answered locally, no model call, no credits.
        const isGreetingOnly =
          !uiMessages.some((m) => m.role === "assistant") &&
          /^(hi|hey|hello|yo|hola|hei|hie|good (morning|afternoon|evening)|greetings|oli otya|wasup|what'?s up)[\s!.,?]*$/i.test(
            intakeText.trim(),
          );

        if (isGreetingOnly) {
          const greeting =
            "👋 Welcome to Allma Safety AI — I'm your safety assistant.\n\nI can help you:\n\n- 🚨 Report a crime\n- 👤 Report a missing person\n- 🎒 Log lost or found property\n- 🏥 Find the nearest hospital\n- 👮 Find the nearest police station\n- 📞 Get emergency numbers\n\nWhat's going on today?\n\n::suggest[Report a crime | Missing person | Find help nearby | Emergency numbers]";
          const assistantId = `allma-greeting-${Date.now()}`;
          const stream = createUIMessageStream({
            originalMessages: uiMessages,
            execute: async ({ writer }) => {
              writer.write({ type: "start", messageId: assistantId });
              writer.write({ type: "text-start", id: "greeting" });
              writer.write({ type: "text-delta", id: "greeting", delta: greeting });
              writer.write({ type: "text-end", id: "greeting" });
              writer.write({ type: "finish" });
            },

            onFinish: async ({ responseMessage }) => {
              if (!userId || !body.threadId) return;
              const rows: Database["public"]["Tables"]["messages"]["Insert"][] = [];
              if (lastUserMessage) {
                rows.push({
                  thread_id: body.threadId,
                  user_id: userId,
                  role: "user",
                  parts: lastUserMessage.parts as never,
                  sdk_message_id: lastUserMessage.id,
                });
              }
              rows.push({
                thread_id: body.threadId,
                user_id: userId,
                role: responseMessage.role,
                parts: responseMessage.parts as never,
                sdk_message_id: responseMessage.id,
              });
              const { error } = await supabase.from("messages").insert(rows);
              if (error) console.error("Failed to persist greeting messages", error);
            },
          });
          return createUIMessageStreamResponse({ stream });
        }


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
        // The model writes ::flow{...} markers inline; we keep the authoritative
        // counter here so the banner only moves forward and the name stays fixed.
        const priorFlows = uiMessages
          .filter((m) => m.role === "assistant")
          .map((m) => parseAllmaMarkers(textOf(m)).flow)
          .filter((flow): flow is NonNullable<typeof flow> => Boolean(flow));
        const lastFlow = priorFlows[priorFlows.length - 1];
        // The label is pinned to the flow that opened the conversation and the
        // step counter is the highest ever reached, so a flow can never rename
        // itself, restart at 1, or count backwards mid-report.
        const firstFlow = priorFlows[0];
        const highestStep = priorFlows.reduce((max, f) => Math.max(max, f.step || 0), 0);
        const flowState = {
          flowLabel: (firstFlow?.label ?? lastFlow?.label ?? null) as string | null,
          step: highestStep,
          totalSteps: priorFlows.reduce((max, f) => Math.max(max, f.total || 0), 0),
          askedTitles: priorFlows.map((f) => f.title.trim().toLowerCase()).filter(Boolean),
        };

        const flowBlock = flowState.flowLabel
          ? `\n\nACTIVE GUIDED FLOW: "${flowState.flowLabel}", currently at step ${flowState.step} of ${flowState.totalSteps || "?"}. Steps already asked: ${
              flowState.askedTitles.join(", ") || "none"
            }.
- The flow name stays exactly "${flowState.flowLabel}" until the flow ends. Never rename it, never restart it.
- Your reply MUST begin with ::flow{type=${flowState.flowLabel}, step=${flowState.step + 1}, total=${Math.max(flowState.totalSteps, flowState.step + 1)}, title="…"} — the step number only ever goes up by one.
- Your reply MUST end with a ::suggest[…] line carrying the exact tappable answers to the question you just asked. A step question without ::suggest is a dead end and is never acceptable.
- Ask the NEXT thing only — never repeat a step already asked, never announce step numbers in your text, never ask two things in one turn.
- Every flow must reach an ending: either call create_report and give the reference number, or say plainly that nothing was filed and why. Never trail off mid-flow.`
          : "";

        // ---- Coordinates the user already shared (from "My current location is: lat, lng")
        const coordMatch = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/.exec(intakeText);
        const deviceLat = Number(body.coords?.latitude);
        const deviceLng = Number(body.coords?.longitude);
        const deviceCoords =
          body.coords && Number.isFinite(deviceLat) && Number.isFinite(deviceLng) && Math.abs(deviceLat) <= 90 && Math.abs(deviceLng) <= 180
            ? { latitude: deviceLat, longitude: deviceLng }
            : null;
        const sharedCoords = coordMatch
          ? { latitude: Number(coordMatch[1]), longitude: Number(coordMatch[2]) }
          : deviceCoords;
        const coordBlock = sharedCoords
          ? `\n\nTHE USER HAS ALREADY SHARED THEIR GPS LOCATION: latitude ${sharedCoords.latitude}, longitude ${sharedCoords.longitude}. ${
              classifyIncident(intakeText) || /hospital|clinic|pharmac|ambulance|police|fire station|fire brigade/i.test(intakeText)
                ? "find_facilities already uses this GPS automatically — call find_facilities (leave area empty unless the user named a town) and do NOT call location_intelligence for this reply."
                : "Call location_intelligence immediately with these latitude and longitude values."
            } Do NOT ask them for an area, landmark or district again, and never assume Kampala.`
          : "";

        // ---- Named intent: the reply must open that flow with a step card.
        const INTENTS: Array<{ matches: RegExp; flow: string; opener: string }> = [
          { matches: /\blost\b|\bfound\b|misplac/i, flow: "Lost & found", opener: 'Did you lose something or find something? Options: "I lost something", "I found something".' },
          { matches: /missing person|missing child|can'?t find (my|our)\s+\w+|disappeared/i, flow: "Missing person", opener: 'Is the missing person an adult or a child? Options: "An adult", "A child".' },
          { matches: /feel(ing)? (unsafe|scared|afraid|followed)|walking (home )?alone|being (followed|watched)|unsafe at night/i, flow: "Safety check", opener: 'FIRST give 4-6 practical safety tips as a bullet list, each on its own line (stay on lit, busy roads; share your live location with a trusted contact; keep your phone ready; avoid shortcuts and earphones; go into an open shop or police post if followed), then the numbers on their own lines (Police 999, Toll-free 112), THEN ask: Are you safe right now? Options: "Yes, I\'m safe", "No, I\'m in danger", "I\'m not sure".' },
          { matches: /sos|immediate danger|being attacked|help me now/i, flow: "Safety check", opener: 'Are you safe right now? Options: "Yes, I\'m safe", "No, I\'m in danger", "I\'m not sure".' },
          { matches: /report (a )?(crime|theft|robbery|assault|burglar|fraud)|stolen|theft|robb|assault/i, flow: "Reporting", opener: 'What kind of incident is this? Options: "Theft", "Robbery", "Assault", "Something else".' },
          { matches: /find help|near me|nearest|police station|hospital|ambulance|fire station/i, flow: "Find help", opener: 'Which service do you need? Options: "Police station", "Hospital", "Fire station".' },
        ];
        const directService = /hospital|clinic|pharmac|ambulance|police|fire station|fire brigade/i.exec(intakeText)?.[0] ?? null;
        const emergencyIncident = flowState.flowLabel ? null : classifyIncident(intakeText);
        const emergencyKind = emergencyIncident ? classifyEmergency(intakeText) : null;
        // Matched incident's playbook section only — loaded with the procedure blocks below.
        const emergencyBlock = emergencyIncident ? emergencyPromptBlock(emergencyIncident, Boolean(sharedCoords)).trim() : "";
        const matchedIntent = emergencyKind ? undefined : INTENTS.find((i) => i.matches.test(intakeText));
        const intent = matchedIntent?.flow === "Find help" && directService ? undefined : matchedIntent;
        const directHelpBlock = matchedIntent?.flow === "Find help" && directService
          ? `\n\nTHE USER ASKED DIRECTLY FOR: ${directService}. Do NOT open a flow, do NOT ask which service they need. Call find_facilities right away for that service in THIS reply — never wait for a location first. ${sharedCoords ? "Use their shared GPS location — unless they named a town or area (e.g. Jinja); then pass that as area, it overrides GPS." : "If the user named a town or area anywhere in the conversation, ALWAYS pass it as area (it overrides GPS). No GPS is shared: call find_facilities with area set to the area they named, or \"Kampala\" if none, and after the results say in one short line they can tap Share my location for places closest to them."} Never add a ::media card or ask for photos or files for this request. Then answer with a short friendly line and finish with "Would you like directions to any of these?"`
          : "";
        const intentBlock = directHelpBlock + (intent
          ? `\n\nTHE USER NAMED AN INTENT: ${intent.flow}. ${
              flowState.flowLabel
                ? `The flow is already running — ask the NEXT step, with a ::flow{type=${flowState.flowLabel}, step=${flowState.step + 1}, total=${Math.max(flowState.totalSteps, flowState.step + 1)}, title="…"} first line and a ::suggest[…] last line.`
                : `Open the "${intent.flow}" flow in THIS reply: first line ::flow{type=${intent.flow}, step=1, total=4, title="…"}, then this opening question: ${intent.opener} and end with a ::suggest[…] line carrying exactly those options.`
            } Do NOT ask this as plain prose without a ::suggest line, do NOT greet or introduce yourself, and stay strictly on this subject: never offer unrelated actions (emergency numbers, find help nearby, generate report) while this flow is running.`
          : "");


        // ---- Anti-repeat guard: the model must not restate its previous message.
        const lastAssistant = [...uiMessages].reverse().find((m) => m.role === "assistant");
        const lastAssistantText = lastAssistant ? textOf(lastAssistant).slice(0, 400) : "";
        const repeatBlock = lastAssistantText
          ? `\n\nYOUR PREVIOUS MESSAGE IN THIS CONVERSATION WAS: "${lastAssistantText}". Never repeat it or re-introduce yourself. Move the conversation forward instead.`
          : "";

        const modelMessages = await convertToModelMessages(uiMessages);

        // ---- Prompt budget: send the compact core always, topic detail only when
        // that topic is actually live. A one-word "hi" no longer pays for the
        // whole 36 KB instruction set.
        const activeFlow = flowState.flowLabel ?? intent?.flow ?? null;
        const isFirstTurn = !uiMessages.some((m) => m.role === "assistant");
        const fullMode = Boolean(activeFlow) || uiMessages.length > 4;
        const needsLocation =
          fullMode ||
          Boolean(sharedCoords) ||
          /location|near me|nearest|police station|hospital|fire station|ambulance|area|landmark/i.test(
            intakeText,
          );
        const promptBlocks = [ALLMA_CORE_PROMPT];
        if (isFirstTurn) promptBlocks.push(ALLMA_ONBOARDING_BLOCK);
        if (fullMode) promptBlocks.push(ALLMA_REPORTING_BLOCK);
        // Situation playbooks: loaded whenever a real safety situation is live.
        const needsProcedures =
          fullMode ||
          Boolean(intent) ||
          Boolean(emergencyKind) ||
          /steal|stole|stolen|thief|theft|snatch|rob|assault|beat|attack|hurt|injur|missing|lost|found|violence|abuse|rape|defile|threaten|accident|crash|knock(ed)? (me|him|her)|fire|burn|smoke|bleed|unconscious|not breathing|choking|stroke|snake bite|burn|fraud|scam|conned|mobile money|momo|suspicious|kidnap|abduct/i.test(
            intakeText,
          );
        if (needsProcedures) promptBlocks.push(ALLMA_PROCEDURES_BLOCK);
        if (emergencyBlock) promptBlocks.push(emergencyBlock);
        if (needsLocation) promptBlocks.push(ALLMA_LOCATION_BLOCK);
        if (fullMode || memoryBlock) promptBlocks.push(ALLMA_MEMORY_BLOCK);
        if (fullMode) promptBlocks.push(ALLMA_DETAIL_BLOCK);
        const systemPrompt = promptBlocks.join("\n\n");

        // ---- Tool budget: greetings and general chat only need the light set.
        const LIGHT_TOOL_NAMES = new Set([
          "location_intelligence",
          "find_facilities",
          "list_alerts",
        ]);
        const selectTools = <T extends Record<string, unknown>>(all: T): T =>
          fullMode
            ? all
            : (Object.fromEntries(
                Object.entries(all).filter(([name]) => LIGHT_TOOL_NAMES.has(name)),
              ) as T);

        // `openai/*` ids are served on the gateway Responses API; everything
        // else stays on the chat-completions provider.
        const resolveModel = (modelId: string) =>
          modelId === CF_CHAT_MODEL && cfModel
            ? cfModel
            : modelId.startsWith("openai/")
              ? responsesGateway.responses(modelId)
              : gateway(modelId);

        const providerOptionsFor = (modelId: string) => {
          if (modelId.startsWith("openai/")) {
            return {
              providerOptions: {
                openai: {
                  forceReasoning: true,
                  reasoningEffort: "low" as const,
                  reasoningSummary: "auto" as const,
                  store: false,
                  include: ["reasoning.encrypted_content"],
                },
              },
            };
          }
          return {};
        };

        const buildStream = (modelId: string) => streamText({
          model: resolveModel(modelId),
          maxRetries: 0,
          abortSignal: request.signal,
          system: `${systemPrompt}\n\n${ALLMA_MARKER_CONTRACT}\n\nThe user is ${
            userId ? "signed in, so reports can be filed." : "NOT signed in. You can still help and give guidance, but if they want a report filed, tell them to sign in first so their report is saved to their account."
          }${memoryBlock}${flowBlock}${coordBlock}${intentBlock}${repeatBlock}\n\nTURN BUDGET: exactly one reply per turn. Write your one message with its inline markers, then stop and wait for the user. Never continue on your own with extra explanations, tours, or a second question in the same turn.`,


          messages: modelMessages,
          stopWhen: stepCountIs(2),
          ...providerOptionsFor(modelId),




          tools: selectTools({


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
                "Find nearby help: police stations, hospitals, fire stations, ambulance services or safe shelters. If the user named a town/area, pass it as area — it overrides GPS. If the result has location_unconfirmed, say you couldn't confirm their location and ask them to share or type it; never list far-away places.",
              inputSchema: z.object({
                facility_type: z.enum(["police", "hospital", "fire", "ambulance", "shelter"]),
                area: z.string().nullable().describe("Optional district or area name"),
              }),
              execute: async ({ facility_type, area }) => {
                const { inUganda, MAX_NEARBY_KM, haversineKm } = await import("@/lib/nearby-guard");
                // A described medical emergency needs real care, not a pharmacy.
                const medicalEmergency = emergencyIncident?.helpTypes.includes("hospital") ?? false;
                const typesFor: Record<string, string[]> = {
                  hospital: medicalEmergency ? ["hospital", "medical_clinic", "doctor"] : ["hospital", "medical_clinic", "doctor", "pharmacy"],
                  ambulance: ["hospital", "medical_clinic", "doctor"],
                  police: ["police"],
                  fire: ["fire_station"],
                  shelter: ["police", "hospital"],
                };
                const unconfirmed = {
                  ok: false,
                  location_unconfirmed: true,
                  emergency_type: facility_type,
                  facilities: [],
                  message:
                    "I couldn't confirm your location, so I won't guess. Tell the user plainly, give the emergency numbers (999 police, 112 toll-free), and ask them to tap Share my location or type their town or area.",
                };
                // A place the USER named wins over GPS; a model-filled default never does. GPS outside Uganda is ignored.
                const picked = chooseSearchOrigin({ area, userText: userConversationText, gps: sharedCoords });
                const named = picked.kind === "named";
                const origin = picked.kind === "none" ? null : { lat: picked.lat, lng: picked.lng, label: picked.label };
                if (!origin) {
                  if (area || sharedCoords) return unconfirmed;
                }
                if (origin) {
                  try {
                    const { lookupNearbyPlaces } = await import("@/lib/places.server");
                    const near = (await lookupNearbyPlaces({
                      latitude: origin.lat,
                      longitude: origin.lng,
                      radiusMeters: named ? 15000 : 8000,
                      limit: 8,
                      types: typesFor[facility_type] ?? [facility_type],
                    })).filter((p) => inUganda(p.latitude, p.longitude) && p.distance_m / 1000 <= MAX_NEARBY_KM);
                    const { refineFacilities } = await import("@/lib/facility-results");
                    const refined = await refineFacilities(near, facility_type, async (missing) => {
                      const { fetchPlacePhones } = await import("@/lib/places.server");
                      const phones = await fetchPlacePhones(missing.filter((m) => m.id.startsWith("google:")).map((m) => m.id));
                      const names = missing.filter((m) => !phones[m.id]).map((m) => m.name.split(/\s+/).slice(0, 2).join(" "));
                      if (names.length) {
                        const { data: rows } = await supabase.from("facilities").select("name, phone").not("phone", "is", null).or(names.map((n) => `name.ilike.%${n.replace(/[,%()]/g, "")}%`).join(",")).limit(40);
                        for (const m of missing) {
                          if (phones[m.id]) continue;
                          const hit = (rows ?? []).find((r) => r.phone && r.name.toLowerCase().includes(m.name.split(/\s+/).slice(0, 2).join(" ").toLowerCase()));
                          if (hit?.phone) phones[m.id] = hit.phone;
                        }
                      }
                      return phones;
                    }, { emergency: medicalEmergency });
                    if (refined.length) {
                      return {
                        ok: true,
                        resolved_area: origin.label,
                        emergency_type: facility_type,
                        count: refined.length,
                        facilities: refined.map((p) => ({
                          name: p.name,
                          facility_type: p.kind,
                          type_label: p.type_label,
                          phone: p.phone,
                          address: p.address,
                          latitude: p.latitude,
                          longitude: p.longitude,
                          open_now: p.open_now,
                          photo_url: p.photo_name ? `/api/public/place-photo?name=${encodeURIComponent(p.photo_name)}` : null,
                          distance_km: Math.round(p.distance_m / 100) / 10,
                        })),
                        note: `Showing exactly ${refined.length} ${facility_type} place(s), sorted by straight-line distance from ${origin.label}. The cards already show them. If you state a number, it MUST be ${refined.length}. If you name a place in text, use ONLY a name from this list with its exact distance_km — never any other place, city or distance; never state travel time.`,
                      };
                    }
                  } catch (err) {
                    console.warn("Nearby places lookup failed; using directory.", err);
                  }
                  const { data, error } = await supabase
                    .from("facilities")
                    .select("name, facility_type, phone, address, district, latitude, longitude")
                    .eq("facility_type", facility_type)
                    .not("latitude", "is", null)
                    .not("longitude", "is", null);
                  if (error) return { ok: false, message: "Directory lookup failed." };
                  const ranked = (data ?? [])
                    .filter((row) => inUganda(Number(row.latitude), Number(row.longitude)))
                    .map((row) => ({
                      ...row,
                      address: cleanAddress(row.address, Number(row.latitude), Number(row.longitude)),
                      distance_km: Math.round(haversineKm(origin.lat, origin.lng, Number(row.latitude), Number(row.longitude)) * 10) / 10,
                    }))
                    .filter((row) => row.distance_km <= MAX_NEARBY_KM)
                    .sort((a, b) => a.distance_km - b.distance_km)
                    .slice(0, 5);
                  if (ranked.length) {
                    return { ok: true, resolved_area: origin.label, emergency_type: facility_type, count: ranked.length, facilities: ranked.map((r) => ({ ...r, type_label: facilityKind(r.facility_type, r.name) })), note: `Showing exactly ${ranked.length} place(s); if you state a number it MUST be ${ranked.length}. distance_km is straight-line; never state travel time.` };
                  }
                  return unconfirmed;
                }
                // No area and no GPS: national directory list, no distances.
                const { data, error } = await supabase
                  .from("facilities")
                  .select("name, facility_type, phone, address, district")
                  .eq("facility_type", facility_type)
                  .ilike("district", "%Kampala%")
                  .limit(5);
                if (error) return { ok: false, message: "Directory lookup failed." };
                return { ok: true, resolved_area: "Kampala (share your location for closer places)", emergency_type: facility_type, count: (data ?? []).length, facilities: data ?? [], note: `Showing exactly ${(data ?? []).length} place(s); don't state a different number.` };
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
              execute: async ({ area, incident_type, latitude: inLat, longitude: inLng }) => {
                const cleaned = area.trim();
                let latitude = inLat;
                let longitude = inLng;
                let resolvedFrom: string | null = null;
                const { inUganda: inUg, MAX_NEARBY_KM: maxKm } = await import("@/lib/nearby-guard");
                // The device GPS the server already knows beats coordinates the model typed;
                // a place wins only when the USER named it. Coordinates outside Uganda (or 0,0) are ignored.
                const modelCoords =
                  Number.isFinite(latitude) && Number.isFinite(longitude) && inUg(latitude!, longitude!)
                    ? { latitude: latitude!, longitude: longitude! }
                    : null;
                const picked = chooseSearchOrigin({ area: cleaned, userText: userConversationText, gps: sharedCoords ?? modelCoords });
                latitude = picked.kind === "none" ? undefined : picked.lat;
                longitude = picked.kind === "none" ? undefined : picked.lng;
                if (picked.kind === "named") resolvedFrom = picked.label;
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
                    .filter((row) => inUg(Number(row.latitude), Number(row.longitude)) && row.distance_km <= maxKm)
                    .sort((a, b) => a.distance_km - b.distance_km);

                  const nearest = (type: string) =>
                    ranked.find((row) => row.facility_type === type) ?? null;

                  const policeStation = nearest("police");
                  const hospital = nearest("hospital");
                  const fireStation = nearest("fire");
                  const found = [policeStation, hospital, fireStation].filter(Boolean).length;

                  return {
                    ok: true,
                    area: picked.kind === "gps" ? "your shared GPS location" : cleaned || "your shared location",
                    resolved_from_area_name: resolvedFrom,
                    incident_type,
                    coordinates: { latitude, longitude },
                    police_station: policeStation,
                    hospital,
                    fire_station: fireStation,
                    nearby_police: ranked.filter((r) => r.facility_type === "police").slice(0, 3),
                    directory_note:
                      found === 0
                        ? "Allma's directory has no facilities with coordinates yet. Tell the user honestly and give the national numbers (Police 999, Toll-free emergency 112)."
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
                      ? `No facilities for "${cleaned}" are in Allma's directory yet. Tell the user honestly, give the national numbers (Police 999, Toll-free emergency 112), and continue helping. If they can share their GPS location, call location_intelligence again with latitude and longitude for the closest station.`
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
          }),

        });

        // Preserve configured models, but never switch providers after a failure.
        // On the Cloudflare deployment the Workers AI binding answers with no credit limits.
        const CHAT_MODELS = cfModel
          ? [CF_CHAT_MODEL]
          : ["openai/gpt-6-astra", "google/gemini-3.6-flash"];


        const selected = await selectChatStream(CHAT_MODELS, buildStream);
        if ("failure" in selected) {
          return new Response(selected.failure.message, {
            status: selected.failure.status,
            headers: { "Cache-Control": "no-store" },
          });
        }
        const { result, model: usedModel } = selected;

        const response = result.toUIMessageStreamResponse({
          sendReasoning: false,
          // Plain-language surface for gateway failures, instead of a silent stall.
          onError: (error) => {
            console.error("Chat stream error", error);
            return getGatewayFailure(error).message;
          },

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

        // Workers AI never calls the Lovable gateway, so there is no run ID to wait for.
        if (usedModel === CF_CHAT_MODEL && cfModel) return response;

        return withLovableAiGatewayRunIdHeader(
          response,
          usedModel.startsWith("openai/") ? responsesGateway : gateway,
        );
      },
    },
  },
});

