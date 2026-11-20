import { classifyIncident, emergencyPromptBlock } from "@/lib/emergency-triage";
import { facilityKind } from "@/lib/facility-kind";
import { cleanAddress, KIND_LABEL, refineFacilities } from "@/lib/facility-results";
import { chooseSearchOrigin } from "@/lib/location-origin";
import { getSeededNearbyFacilities } from "@/lib/nearby-fallback";
import {
  isReportingIntent,
  canUseFilingTools,
  isFilingToolName,
  isSoftGuidedFlow,
  nearbyHelpTypesForTurn,
  isEmergencyNumbersAsk,
  scriptedFlowOpener,
  shouldLoadReportingPrompt,
  shouldShowDirectHelp,
} from "@/lib/chat-intent";
import { CF_CHAT_MODEL, getCloudflareChatModel } from "@/lib/cloudflare-ai.server";
import { getGatewayFailure, selectChatStream } from "@/lib/ai-gateway-errors";
import { createFileRoute } from "@tanstack/react-router";
import { withTimeoutFallback } from "@/lib/async-timeout";
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
  ALLMA_LOCATION_BLOCK,
  ALLMA_MEMORY_BLOCK,
  ALLMA_ONBOARDING_BLOCK,
  ALLMA_PROCEDURES_BLOCK,
  ALLMA_REPORTING_BLOCK,
} from "@/lib/allma-prompt";
import { ALLMA_MARKER_CONTRACT, parseAllmaMarkers } from "@/lib/allma-markers";
import { facilitySearchInputSchema } from "@/lib/facility-search-input";
import {
  mergeCanonicalChatHistory,
  sharedThreadHasAssistantHistory,
  type SharedHistoryRow,
} from "@/lib/shared-chat-history";
import { publishConversationMessage } from "@/lib/publish-conversation-message";


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

const PHYSICAL_SYMPTOM_FIRST_AID_RULE =
  "PHYSICAL FIRST-AID RULE: When the user describes any physical symptom, pain, or injury (including swelling, bleeding, or burns), write clear numbered first-aid steps and urgent red flags in your message text. Nearby help is required on the same turn — call find_facilities (never write the tool name or ::find_facilities{…} as text). If the tool runs first, still write the numbered steps and red flags in your follow-up text. Do not emit a separate PHYSICAL_FIRSTAID tool/card. Never open ::flow / Safety check for pain or injury. Never re-ask a question already answered. Never spam ::media every turn — at most one optional photo after the steps.";

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
        const t0 = Date.now();
        const stages: Record<string, number> = {};
        const mark = (name: string) => {
          stages[name] = Date.now() - t0;
        };
        const logTiming = (model?: string) => {
          console.log(`chat-timing ${JSON.stringify({ ...stages, total: Date.now() - t0, ...(model ? { model } : {}) })}`);
        };

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
        let threadIsOwner = Boolean(userId && threadId);
        let sharedSosActive = false;
        if (threadId) {
          const { data: contextRows, error: contextError } = await (supabase as any).rpc("get_chat_thread_context",
            { p_thread_id: threadId },
          );
          const context = contextRows?.[0];
          if (contextError || !context) {
            return new Response("This conversation is not available to this account.", {
              status: 403,
              headers: { "Cache-Control": "no-store" },
            });
          }
          threadIsOwner = context.is_owner;
          sharedSosActive = Boolean(context.sos_active);
        }
        const evidence = parseEvidence(body.evidence);
        const sharedEmergencyBlock = sharedSosActive
          ? `\n\nSHARED EMERGENCY CONVERSATION (SOS ACTIVE):
- This is ONE conversation shared by the person in need, Allma AI, and authorized Safety Network responders who accepted the alert.
- Stay in this conversation. Never invent a separate group chat or claim responders were dispatched unless a tool/backend confirms it.
- The latest human message may be from the conversation owner OR an authorized responder.
- Keep replies calm, short, and useful for everyone in the room.
- Acknowledge when a responder joins or shares location/status, without repeating the same automated sentence.
- Prefer clarifying questions that help responders act safely.
- Continue first-aid / safety guidance for the owner when relevant.
- Do not claim emergency services were contacted unless confirmed.`
          : "";


        const initialRunId = getLovableAiGatewayRunId(request);
        const gateway = createLovableAiGatewayProvider(apiKey, initialRunId);
        const responsesGateway = createLovableAiGatewayResponsesProvider(apiKey, initialRunId);

        // Canonical shared history: responders often only have the latest local
        // turn. Load the original thread from Supabase so everyone shares one timeline.
        let databaseHistory: SharedHistoryRow[] = [];
        if (threadId) {
          const { data: historyRows, error: historyError } = await (supabase as any).rpc(
            "list_shared_conversation_messages",
            { p_thread_id: threadId },
          );
          if (historyError) {
            const fallback = await supabase
              .from("messages")
              .select("id, user_id, role, parts, sdk_message_id, created_at")
              .eq("thread_id", threadId)
              .order("created_at", { ascending: true })
              .limit(200);
            if (fallback.error) {
              console.error("Failed to load shared conversation history", historyError, fallback.error);
            } else {
              databaseHistory = (fallback.data ?? []) as SharedHistoryRow[];
            }
          } else {
            databaseHistory = (historyRows ?? []) as SharedHistoryRow[];
          }
        }

        const uiMessages = mergeCanonicalChatHistory(databaseHistory, messages as UIMessage[]);
        const lastUserMessage = [...(messages as UIMessage[])].reverse().find((m) => m.role === "user")
          ?? [...uiMessages].reverse().find((m) => m.role === "user");
        const intakeText = lastUserMessage ? textOf(lastUserMessage) : "";
        // Everything the user typed in this conversation — a place counts as "named" only if it's here.
        const userConversationText = uiMessages.filter((m) => m.role === "user").map((m) => textOf(m)).join("\n");
        const hasSharedAssistantHistory = sharedThreadHasAssistantHistory(databaseHistory);

        // Publish the human turn immediately so other participants see it over Realtime.
        if (userId && threadId && lastUserMessage) {
          const earlyError = await publishConversationMessage(supabase, {
            threadId,
            userId,
            role: "user",
            parts: lastUserMessage.parts,
            sdkMessageId: lastUserMessage.id,
          });
          if (earlyError) {
            console.error("Failed to publish shared user message early", earlyError);
          }
        }

        // ---- Greeting-only opener: answered locally, no model call, no credits.
        // Never greet inside an active shared SOS or when the canonical thread
        // already has Allma history — that was creating a "separate chat" feel.
        const isGreetingOnly =
          !sharedSosActive &&
          !hasSharedAssistantHistory &&
          !uiMessages.some((m) => m.role === "assistant") &&
          /^(hi|hey|hello|yo|hola|hei|hie|good (morning|afternoon|evening)|greetings|oli otya|wasup|what'?s up)[\s!.,?]*$/i.test(
            intakeText.trim(),
          );

        const replyWithFixedText = (text: string, idPrefix: string) => {
          const assistantId = `${idPrefix}-${Date.now()}`;
          const stream = createUIMessageStream({
            originalMessages: uiMessages,
            execute: async ({ writer }) => {
              writer.write({ type: "start", messageId: assistantId });
              writer.write({ type: "text-start", id: idPrefix });
              writer.write({ type: "text-delta", id: idPrefix, delta: text });
              writer.write({ type: "text-end", id: idPrefix });
              writer.write({ type: "finish" });
            },
            onFinish: async ({ responseMessage }) => {
              if (!userId || !body.threadId) return;
              const error = await publishConversationMessage(supabase, {
                threadId: body.threadId,
                userId,
                role: responseMessage.role,
                parts: responseMessage.parts,
                sdkMessageId: responseMessage.id,
              });
              if (error) console.error("Failed to persist scripted chat messages", error);
            },
          });
          return createUIMessageStreamResponse({ stream });
        };

        if (isGreetingOnly) {
          return replyWithFixedText(
            "👋 Welcome to Allma Safety AI — I'm your safety assistant.\n\nI can help you:\n\n- 🚨 Report a crime\n- 👤 Report a missing person\n- 🎒 Log lost or found property\n- 🏥 Find the nearest hospital\n- 👮 Find the nearest police station\n- 📞 Get emergency numbers\n\nWhat's going on today?\n\n::suggest[Report a crime | Missing person | Find help nearby | Emergency numbers]",
            "allma-greeting",
          );
        }

        // Clear menu/chip intents open a real guided step locally — never call the
        // model (which was emitting empty REPORT SUMMARY · Done cards).
        const priorFlowLabel =
          [...uiMessages]
            .reverse()
            .filter((m) => m.role === "assistant")
            .map((m) => parseAllmaMarkers(textOf(m)).flow?.label)
            .find(Boolean) ?? null;
        const scripted =
          sharedSosActive || hasSharedAssistantHistory
            ? null
            : scriptedFlowOpener(intakeText, priorFlowLabel);
        if (scripted) {
          return replyWithFixedText(scripted, "allma-flow");
        }


        if (userId && intakeText && threadIsOwner) {
          const normalized = intakeText.toLowerCase();
          const severity =
            /sos|immediate danger|attack|assault|gunshot|fire|ambulance|accident/.test(normalized)
              ? "critical"
              : /robbery|missing|stolen|theft|crime/.test(normalized)
                ? "high"
                : "info";
          void supabase.from("safety_activity").insert({
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
          }).then(({ error: activityError }) => {
            if (activityError) console.error("Failed to record AI intake activity", activityError);
          });
        }
        mark("intake");

        let memoryBlock = "";
        if (userId && (!threadId || threadIsOwner)) {
          const memoryRows = await withTimeoutFallback(
            supabase
              .from("ai_user_memory")
              .select("kind, key, value")
              .eq("user_id", userId)
              .order("updated_at", { ascending: false })
              .limit(30)
              .then((res) => res.data ?? null),
            2000,
            null,
            "user-memory",
          );
          if (memoryRows && memoryRows.length > 0) {
            memoryBlock = `\n\nWHAT YOU ALREADY KNOW ABOUT THIS USER (do not re-ask these):\n${memoryRows
              .map((row) => `- ${row.key} (${row.kind}): ${row.value}`)
              .join("\n")}`;
          }
        }
        mark("memory");

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
        const softFlowActive = isSoftGuidedFlow(flowState.flowLabel);

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
          ? `\n\nGPS IS AVAILABLE for this conversation. Do not ask the user for their location again; a place they explicitly named takes priority over GPS.`
          : "";

        // ---- Named intent: the reply must open that flow with a step card.
        const INTENTS: Array<{ matches: RegExp; flow: string; opener: string }> = [
          { matches: /\blost\b|\bfound\b|misplac/i, flow: "Lost & found", opener: 'Did you lose something or find something? Options: "I lost something", "I found something".' },
          { matches: /missing person|missing child|can'?t find (my|our)\s+\w+|disappeared/i, flow: "Missing person", opener: 'Is the missing person an adult or a child? Options: "An adult", "A child".' },
          { matches: /feel(ing)? (unsafe|scared|afraid|followed)|walking (home )?alone|being (followed|watched)|unsafe at night/i, flow: "Safety check", opener: 'FIRST give 4-6 practical safety tips as a bullet list, each on its own line (stay on lit, busy roads; share your live location with a trusted contact; keep your phone ready; avoid shortcuts and earphones; go into an open shop or police post if followed), then the numbers on their own lines (Police 999, Toll-free 112), THEN ask: Are you safe right now? Options: "Yes, I\'m safe", "No, I\'m in danger", "I\'m not sure".' },
          { matches: /sos|immediate danger|being attacked|help me now/i, flow: "Safety check", opener: 'Are you safe right now? Options: "Yes, I\'m safe", "No, I\'m in danger", "I\'m not sure".' },
          { matches: /report (a )?(crime|theft|robbery|assault|burglar|fraud)|stolen|theft|robb|assault/i, flow: "Reporting", opener: 'What kind of incident is this? Options: "Theft", "Robbery", "Assault", "Something else". Do NOT call report_summary or create_report yet — only open the ::flow and ask this question.' },
        ];
        const directFacilityTypes = [
          [/\bpolice(?: station| post)?\b/i, "police"],
          [/\b(?:hospital|clinic|pharmacy|pharmacist|doctor|health cent(?:re|er))\b/i, "hospital"],
          [/\bambulance\b/i, "ambulance"],
          [/\bfire (?:station|brigade|service)\b/i, "fire"],
          [/\b(?:shelter|safe house)\b/i, "shelter"],
        ]
          .filter(([pattern]) => (pattern as RegExp).test(intakeText))
          .map(([, type]) => type as "police" | "hospital" | "ambulance" | "fire" | "shelter");
        // Generic "find help / near me" requests skip any wizard and show police + hospitals at once.
        if (directFacilityTypes.length === 0 && /find help|help nearby|nearby help|near me|nearest/i.test(intakeText)) {
          directFacilityTypes.push("police", "hospital");
        }
        const directService = directFacilityTypes[0] ??
          (/\bhospital|clinic|pharmac|ambulance|police|fire station|fire brigade/i.exec(intakeText)?.[0] ?? null);
        // Soft flows (Safety check / Advice) must not block medical first-aid. Hard report
        // flows still suppress emergency classification so the wizard stays in control.
        const hardFlowBlocksEmergency = Boolean(flowState.flowLabel) && !softFlowActive;
        const shortSoftAnswer =
          softFlowActive &&
          /^(yes|no|y|n|yeah|yep|nope|leg|arm|head|hand|foot|chest|back|neck|stomach|it hurts|hurts|bleeding|deep|shallow)[.!]?$/i.test(
            intakeText.trim(),
          );
        const emergencyFromIntake = hardFlowBlocksEmergency ? null : classifyIncident(intakeText);
        const emergencyFromThread =
          softFlowActive && !emergencyFromIntake && !directService && shortSoftAnswer
            ? uiMessages
                .filter((m) => m.role === "user")
                .map((m) => classifyIncident(textOf(m)))
                .find(Boolean) ?? null
            : null;
        const emergencyIncident = emergencyFromIntake ?? emergencyFromThread;
        const emergencyKind = emergencyIncident
          ? emergencyIncident.marker === "fire"
            ? "fire"
            : emergencyIncident.marker === "crime"
              ? "violence"
              : "medical"
          : null;
        const matchedIntent = emergencyKind ? undefined : INTENTS.find((i) => i.matches.test(intakeText));
        const isReporting = isReportingIntent({
          flowLabel: flowState.flowLabel,
          matchedFlow: matchedIntent?.flow,
          intakeText,
        });
        const reportingIntent = INTENTS.find((candidate) => candidate.flow === "Reporting");
        const intent =
          isReporting && !flowState.flowLabel
            ? reportingIntent
            : matchedIntent?.flow === "Find help" && directService
              ? undefined
              : matchedIntent;
        const hasNonFindHelpIntent =
          intent !== undefined && intent.flow !== "Find help";
        // A reporting request must never be replaced by a facilities search.
        // Soft Safety check / Advice flows DO yield to an explicit hospital/police ask.
        const shouldShowHelp = shouldShowDirectHelp(
          directService,
          isReporting,
          flowState.flowLabel,
          Boolean(emergencyIncident) && !directService,
        );
        // Every injury/emergency turn must surface nearby help cards — not only when the user asks.
        const nearbyTypes = nearbyHelpTypesForTurn({
          directFacilityTypes,
          directService,
          emergencyHelpTypes: emergencyIncident?.helpTypes ?? [],
          isReporting,
          showDirectHelp: shouldShowHelp,
        });
        const requireNearbyHelp = nearbyTypes.length > 0;
        // Drop the survey banner when first-aid or a facility search takes over.
        const continueGuidedFlow =
          Boolean(flowState.flowLabel) && !requireNearbyHelp && !(emergencyIncident && softFlowActive);
        const flowBlock = continueGuidedFlow
          ? `\n\nACTIVE GUIDED FLOW: "${flowState.flowLabel}", currently at step ${flowState.step} of ${flowState.totalSteps || "?"}. Steps already asked: ${
              flowState.askedTitles.join(", ") || "none"
            }.
- The flow name stays exactly "${flowState.flowLabel}" until the flow ends. Never rename it, never restart it.
- Your reply MUST begin with ::flow{type=${flowState.flowLabel}, step=${flowState.step + 1}, total=${Math.max(flowState.totalSteps, flowState.step + 1)}, title="…"} — the step number only ever goes up by one.
- Your reply MUST end with a ::suggest[…] line carrying the exact tappable answers to the question you just asked. A step question without ::suggest is a dead end and is never acceptable.
- Ask the NEXT thing only — never repeat a step already asked, never announce step numbers in your text, never ask two things in one turn.
- Never request a photo unless this step truly needs evidence, and never on every step.
- Every flow must reach an ending: either call create_report and give the reference number, or say plainly that nothing was filed and why. Never trail off mid-flow.`
          : emergencyIncident && softFlowActive
            ? `\n\nEND THE "${flowState.flowLabel}" FLOW NOW. The user described a physical injury or medical need — do not continue survey steps, do not emit ::flow, and do not ask for a photo on every turn. Give first-aid and ALWAYS call find_facilities for nearby help.`
            : requireNearbyHelp && softFlowActive
              ? `\n\nEND THE "${flowState.flowLabel}" FLOW NOW. The user needs nearby help — call find_facilities and do not continue survey steps.`
              : "";
        const directHelpBlock = requireNearbyHelp
          ? `\n\nFACILITY SEARCH REQUIRED THIS TURN: Call find_facilities once with facility_types=[${nearbyTypes.join(", ")}]. Nearby help cards must appear on this reply. Do not open a flow or ask which service they need. Follow the nearby-help location rules. Do not add a media card or repeat the returned place cards. Never write ::find_facilities{…} as text.`
          : "";
        // Keep emergency advice for emergencies outside a guided incident report.
        const emergencyBlock = emergencyIncident
          ? isReporting
            ? emergencyIncident.lifeThreatening
              ? `\n\nACTIVE DANGER WHILE REPORTING: Keep the Reporting guided flow open. If anyone is in immediate danger, give one short safety instruction, direct them to Police 999 or emergency 112, and include ::emergency{type=${emergencyIncident.marker}}. Do not call find_facilities only because the user mentioned police or a hospital. Then continue the report with one question.`
              : ""
            : emergencyPromptBlock(emergencyIncident, Boolean(sharedCoords)).trim()
          : "";
        const intentBlock = directHelpBlock + (intent && continueGuidedFlow
          ? `\n\nTHE USER NAMED AN INTENT: ${intent.flow}. ${
              flowState.flowLabel
                ? `The flow is already running — ask the NEXT step, with a ::flow{type=${flowState.flowLabel}, step=${flowState.step + 1}, total=${Math.max(flowState.totalSteps, flowState.step + 1)}, title="…"} first line and a ::suggest[…] last line.`
                : `Open the "${intent.flow}" flow in THIS reply: first line ::flow{type=${intent.flow}, step=1, total=4, title="…"}, then this opening question: ${intent.opener} and end with a ::suggest[…] line carrying exactly those options.`
            } Do NOT ask this as plain prose without a ::suggest line, do NOT greet or introduce yourself, and stay strictly on this subject: never offer unrelated actions (emergency numbers, find help nearby, generate report) while this flow is running.`
          : intent && !flowState.flowLabel && !emergencyIncident && !requireNearbyHelp
            ? `\n\nTHE USER NAMED AN INTENT: ${intent.flow}. Open the "${intent.flow}" flow in THIS reply: first line ::flow{type=${intent.flow}, step=1, total=4, title="…"}, then this opening question: ${intent.opener} and end with a ::suggest[…] line carrying exactly those options. Do NOT ask this as plain prose without a ::suggest line, do NOT greet or introduce yourself, and stay strictly on this subject: never offer unrelated actions (emergency numbers, find help nearby, generate report) while this flow is running.`
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
        const isReportFlow = ["Reporting", "Missing person", "Lost & found"].includes(activeFlow ?? "");
        const hasReportContext = shouldLoadReportingPrompt({
          isReportFlow,
          isReporting,
          intakeText,
        });
        const needsLocation =
          activeFlow === "Find help" ||
          requireNearbyHelp ||
          Boolean(sharedCoords) ||
          /location|near me|nearest|police station|hospital|fire station|ambulance|area|landmark/i.test(
            intakeText,
          );
        const promptBlocks = [ALLMA_CORE_PROMPT];
        if (isFirstTurn && !intent && !emergencyIncident && !directService) {
          promptBlocks.push(ALLMA_ONBOARDING_BLOCK);
        }
        if (hasReportContext) promptBlocks.push(ALLMA_REPORTING_BLOCK);
        // Situation playbooks: loaded whenever a real safety situation is live.
        const needsProcedures =
          (Boolean(activeFlow) && activeFlow !== "Find help") ||
          hasNonFindHelpIntent ||
          Boolean(emergencyKind) ||
          /steal|stole|stolen|thief|theft|snatch|rob|assault|beat|attack|hurt|injur|missing|lost|found|violence|abuse|rape|defile|threaten|accident|crash|knock(ed)? (me|him|her)|fire|burn|smoke|bleed|unconscious|not breathing|choking|stroke|snake bite|burn|fraud|scam|conned|mobile money|momo|suspicious|kidnap|abduct/i.test(
            intakeText,
          );
        if (needsProcedures) promptBlocks.push(ALLMA_PROCEDURES_BLOCK);
        if (emergencyBlock) promptBlocks.push(emergencyBlock);
        if (needsLocation) promptBlocks.push(ALLMA_LOCATION_BLOCK);
        if (
          memoryBlock ||
          /\b(remember|earlier|previous conversation|last time|my report|my reports|draft)\b/i.test(intakeText)
        ) promptBlocks.push(ALLMA_MEMORY_BLOCK);
        const systemPrompt = promptBlocks.join("\n\n");
        mark("prompt");

        // ---- Tool budget: greetings and general chat only need the light set.
        // Filing tools stay locked until the report flow has real answers, so the
        // model cannot skip straight to an empty report_summary card.
        // list_alerts is opt-in only when the user asks about alerts — otherwise
        // the model was dumping empty "NEARBY HELP · No active alerts" cards.
        const wantsAlerts = /\balerts?\b|community (news|warning)|safety alert/i.test(intakeText);
        const LIGHT_TOOL_NAMES = new Set([
          "find_facilities",
          ...(wantsAlerts ? (["list_alerts"] as const) : []),
        ]);
        const filingAllowed = canUseFilingTools({
          flowLabel: flowState.flowLabel,
          step: flowState.step,
          askedTitles: flowState.askedTitles,
        });
        const selectTools = <T extends Record<string, unknown>>(all: T): T => {
          let entries = Object.entries(all);
          if (!fullMode) {
            entries = entries.filter(([name]) => LIGHT_TOOL_NAMES.has(name));
          } else if (!wantsAlerts) {
            entries = entries.filter(([name]) => name !== "list_alerts");
          }
          if (!filingAllowed) {
            entries = entries.filter(([name]) => !isFilingToolName(name));
          }
          // Emergency-number asks must never trigger facility/alert tools.
          if (isEmergencyNumbersAsk(intakeText)) {
            entries = entries.filter(([name]) => name !== "find_facilities" && name !== "list_alerts");
          }
          return Object.fromEntries(entries) as T;
        };

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
                  forceReasoning: false,
                  reasoningEffort: "minimal" as const,
                  reasoningSummary: "auto" as const,
                  store: false,
                  include: ["reasoning.encrypted_content"],
                },
              },
            };
          }
          return {};
        };

        type ProgressStep = "understanding" | "finding" | "phones" | "writing";
        let progressSink: ((step: ProgressStep) => void) | undefined;
        const reportProgress = (step: ProgressStep) => {
          progressSink?.(step);
        };
        let facilityCardsRendered = false;
        const facilityToolOutput = <T extends { facilities?: unknown }>(output: T) => {
          if (Array.isArray(output.facilities)) facilityCardsRendered = true;
          return output;
        };

        const buildStream = (modelId: string) => streamText({
          model: resolveModel(modelId),
          maxRetries: 0,
          maxOutputTokens: 384,
          abortSignal: request.signal,
          system: `${systemPrompt}\n\n${PHYSICAL_SYMPTOM_FIRST_AID_RULE}\n\n${ALLMA_MARKER_CONTRACT}${sharedEmergencyBlock}\n\nThe user is ${
            userId ? "signed in, so reports can be filed." : "NOT signed in. You can still help and give guidance, but if they want a report filed, tell them to sign in first so their report is saved to their account."
          }${
            sharedSosActive
              ? threadIsOwner
                ? " This sender is the conversation owner during an active SOS."
                : " This sender is an authorized Safety Network responder in the shared SOS conversation."
              : ""
          }${memoryBlock}${flowBlock}${coordBlock}${intentBlock}${repeatBlock}\n\nTURN BUDGET: exactly one reply per turn. Write your one message with its inline markers, then stop and wait for the user. Never continue on your own with extra explanations, tours, or a second question in the same turn.`,


          messages: modelMessages,
          // Injury/emergency turns always search nearby help. Keep a second step so
          // first-aid text can follow the forced facility tool call.
          ...(requireNearbyHelp
            ? { toolChoice: { type: "tool" as const, toolName: "find_facilities" } }
            : {}),
          stopWhen:
            requireNearbyHelp && emergencyIncident
              ? [stepCountIs(2)]
              : [stepCountIs(2), () => facilityCardsRendered],
          ...providerOptionsFor(modelId),
          onChunk: ({ chunk }) => {
            if (chunk.type === "text-delta" || chunk.type === "text-start") {
              reportProgress("writing");
            }
          },




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
                "Show a review card with all collected report details before filing. Use this AFTER collecting all details and BEFORE calling create_report. The user can confirm or ask to edit. Once confirmed, call create_report with the same fields. Never call this on the first turn of a report — open the ::flow and ask questions first.",
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
              execute: async (input) => {
                if (!String(input.title ?? "").trim() || !String(input.summary ?? "").trim()) {
                  return {
                    ok: false,
                    error:
                      "Report summary rejected: title and summary are required. Keep asking guided ::flow questions until details are collected.",
                  };
                }
                return { ok: true, ...input };
              },
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

                const followUpWrites: Promise<void>[] = [
                  (async () => {
                    const { error: activityError } = await (supabase as any).from("safety_activity").insert({
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
                  })(),
                ];
                if (evidence.length) {
                  followUpWrites.push((async () => {
                    const { error: evidenceError } = await supabase.from("report_evidence").insert(
                      evidence.map((item) => ({
                        report_id: data.id,
                        user_id: userId,
                        storage_path: item.path,
                        media_type: item.mediaType,
                      })),
                    );
                    if (evidenceError) console.error("Failed to link evidence", evidenceError);
                  })());
                }
                await Promise.all(followUpWrites);



                return { ok: true, ...data };
              },
            }),
            find_facilities: tool({
              description:
                "Find nearby help in ONE call. Include every requested type in facility_types (police, hospital, fire, ambulance, shelter). A named town overrides GPS. The UI renders place cards; do not repeat results after this tool returns.",
              inputSchema: facilitySearchInputSchema,
              execute: async ({ facility_types, area }) => {
                const requestedTypes = [...new Set(
                  facility_types.length ? facility_types : ["police", "hospital"],
                )];
                const facility_type = requestedTypes[0];
                reportProgress("finding");
                const searchStarted = Date.now();
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
                const placeTypes = [...new Set(requestedTypes.flatMap((type) => typesFor[type] ?? [type]))];
                const unconfirmed = {
                  ok: false,
                  location_unconfirmed: true,
                  emergency_type: facility_type,
                  emergency_types: requestedTypes,
                  facilities: [],
                  message:
                    "I couldn't confirm your location, so I won't guess. Tell the user plainly, give the emergency numbers (999 police, 112 toll-free), and ask them to tap Share my location or type their town or area.",
                };
                // A place the USER named wins over GPS; a model-filled default never does. GPS outside Uganda is ignored.
                const picked = chooseSearchOrigin({ area, userText: userConversationText, gps: sharedCoords });
                const named = picked.kind === "named";
                let origin: { lat: number; lng: number; label: string } | null =
                  picked.kind === "none" ? null : { lat: picked.lat, lng: picked.lng, label: picked.label };
                const vagueArea = /^(nearby|near me|near|here|around|around me|my area|current location|local|any)?$/i.test(
                  (area ?? "").trim(),
                );
                if (!origin && !sharedCoords && vagueArea) {
                  origin = { lat: 0.3152, lng: 32.5816, label: "Central Kampala (share your location for closer help)" };
                }
                if (!origin && sharedCoords) return facilityToolOutput(unconfirmed);
                const fallbackCenter = origin ?? { lat: 0.3152, lng: 32.5816 };
                const fallbackArea = origin?.label ?? "Kampala directory fallback (location not confirmed)";
                const seededFacilityFallback = async (note: string) => {
                  const seeded = getSeededNearbyFacilities(fallbackCenter, named ? 15_000 : 10_000);
                  const refinedSeeded = await refineFacilities(
                    seeded,
                    requestedTypes,
                    async () => ({}),
                    { emergency: medicalEmergency },
                  );
                  const facilities = refinedSeeded.map((place) => ({
                    name: place.name,
                    facility_type: place.kind,
                    type_label: place.type_label,
                    phone: place.phone,
                    address: place.address,
                    latitude: place.latitude,
                    longitude: place.longitude,
                    open_now: place.open_now,
                    distance_km: Math.round(place.distance_m / 100) / 10,
                  }));
                  return facilityToolOutput({
                    ok: facilities.length > 0,
                    resolved_area: fallbackArea,
                    emergency_type: facility_type,
                    emergency_types: requestedTypes,
                    count: facilities.length,
                    facilities,
                    note: facilities.length
                      ? note
                      : "No nearby facilities could be confirmed. Ask the user to share location or enter a town; keep emergency numbers available.",
                  });
                };
                if (!origin) {
                  const directoryArea = area?.trim() ?? "";
                  const safeArea = directoryArea
                    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
                    .replace(/\s+/g, " ")
                    .trim();
                  if (safeArea) {
                    try {
                      const { publicDirectoryClient } = await import("@/lib/places.server");
                      const { data: matchedFacilities, error } = await publicDirectoryClient()
                        .from("facilities")
                        .select("*")
                        .in("facility_type", placeTypes)
                        .or(
                          `district.ilike.%${safeArea}%,name.ilike.%${safeArea}%,address.ilike.%${safeArea}%`,
                        )
                        .limit(8);
                      if (error) {
                        console.warn("Facility directory area search failed", error);
                        return seededFacilityFallback("The directory was unavailable; showing seeded nearby options.");
                      }
                      if (matchedFacilities?.length) {
                        const facilities = matchedFacilities.map((row) => {
                          const latitude =
                            row.latitude == null || !Number.isFinite(Number(row.latitude))
                              ? null
                              : Number(row.latitude);
                          const longitude =
                            row.longitude == null || !Number.isFinite(Number(row.longitude))
                              ? null
                              : Number(row.longitude);
                          const kind = facilityKind(row.facility_type, row.name);
                          return {
                            name: row.name,
                            facility_type: kind,
                            type_label: KIND_LABEL[kind] ?? "Facility",
                            phone: row.phone,
                            address:
                              cleanAddress(row.address, latitude ?? undefined, longitude ?? undefined) ??
                              row.district ??
                              safeArea,
                            district: row.district,
                            latitude,
                            longitude,
                            open_now: row.is_24_7 ? true : null,
                          };
                        });
                        return facilityToolOutput({
                          ok: true,
                          resolved_area: safeArea,
                          emergency_type: facility_type,
                          emergency_types: requestedTypes,
                          count: facilities.length,
                          facilities,
                          note: `Showing ${facilities.length} public directory match(es) for ${safeArea}. Distances are not available without a confirmed location.`,
                        });
                      }
                    } catch (err) {
                      console.warn("Facility directory area search failed", err);
                      return seededFacilityFallback("The directory was unavailable; showing seeded nearby options.");
                    }
                  }
                  return seededFacilityFallback("No directory matches were found; showing seeded nearby options.");
                }
                if (origin) {
                  try {
                    const { lookupNearbyPlaces, phoneLookupBudgetLeft } = await import("@/lib/places.server");
                    const near = (await withTimeoutFallback(
                      lookupNearbyPlaces({
                        latitude: origin.lat,
                        longitude: origin.lng,
                        radiusMeters: named ? 15000 : 8000,
                        limit: 8,
                        types: placeTypes,
                      }),
                      6000,
                      [],
                      "lookup-nearby-places",
                    )).filter((p) => inUganda(p.latitude, p.longitude) && p.distance_m / 1000 <= MAX_NEARBY_KM);
                    mark("places_search");
                    const refined = await refineFacilities(near, requestedTypes, async (missing) => {
                      if (phoneLookupBudgetLeft(searchStarted, Date.now(), 6000) <= 0) return {};
                      reportProgress("phones");
                      const { fetchPlacePhones } = await import("@/lib/places.server");
                      const names = [...new Set(missing.map((m) => m.name.split(/\s+/).slice(0, 2).join(" ")))];
                      const directoryLookup = names.length
                        ? withTimeoutFallback(
                          supabase.from("facilities").select("name, phone").not("phone", "is", null).or(names.map((n) => `name.ilike.%${n.replace(/[,%()]/g, "")}%`).join(",")).limit(40).then((res) => res.data ?? null),
                          2000,
                          null,
                          "facility-phones",
                        )
                        : Promise.resolve(null);
                      const [phones, rows] = await Promise.all([
                        fetchPlacePhones(
                          missing.filter((m) => m.id.startsWith("google:")).map((m) => m.id),
                          { startedAt: searchStarted, budgetMs: 6000 },
                        ),
                        directoryLookup,
                      ]);
                      for (const m of missing) {
                        if (phones[m.id]) continue;
                        const name = m.name.split(/\s+/).slice(0, 2).join(" ").toLowerCase();
                        const hit = (rows ?? []).find((r) => r.phone && r.name.toLowerCase().includes(name));
                        if (hit?.phone) phones[m.id] = hit.phone;
                      }
                      mark("place_phones");
                      return phones;
                    }, { emergency: medicalEmergency });
                    if (refined.length) {
                      return facilityToolOutput({
                        ok: true,
                        resolved_area: origin.label,
                        emergency_type: facility_type,
                        emergency_types: requestedTypes,
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
                        note: `Showing exactly ${refined.length} place(s) across ${requestedTypes.join(" and ")}, sorted by straight-line distance from ${origin.label}. The cards already show them; never state travel time.`,
                      });
                    }
                  } catch (err) {
                    console.warn("Nearby places lookup failed; using directory.", err);
                  }
                  try {
                    const { data, error } = await supabase
                      .from("facilities")
                      .select("name, facility_type, phone, address, district, latitude, longitude")
                      .in("facility_type", requestedTypes)
                      .not("latitude", "is", null)
                      .not("longitude", "is", null);
                    if (error) {
                      console.warn("Facility coordinate directory search failed", error);
                      return seededFacilityFallback("The directory was unavailable; showing seeded nearby options.");
                    }
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
                      return facilityToolOutput({ ok: true, resolved_area: origin.label, emergency_type: facility_type, emergency_types: requestedTypes, count: ranked.length, facilities: ranked.map((r) => ({ ...r, type_label: facilityKind(r.facility_type, r.name) })), note: `Showing exactly ${ranked.length} place(s); distance_km is straight-line; never state travel time.` });
                    }
                  } catch (err) {
                    console.warn("Facility coordinate directory search failed", err);
                    return seededFacilityFallback("The directory was unavailable; showing seeded nearby options.");
                  }
                  return seededFacilityFallback("No directory matches were found; showing seeded nearby options.");
                }
                return seededFacilityFallback("Showing seeded nearby options.");
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
        mark("model_ready");
        if ("failure" in selected) {
          logTiming();
          return new Response(selected.failure.message, {
            status: selected.failure.status,
            headers: { "Cache-Control": "no-store" },
          });
        }
        const { result, model: usedModel } = selected;

        const stream = createUIMessageStream({
          originalMessages: uiMessages,
          execute: async ({ writer }) => {
            const emit = (step: ProgressStep) => {
              writer.write({ type: "data-chat-progress", data: { step } });
            };
            emit("understanding");
            progressSink = emit;
            writer.merge(
              result.toUIMessageStream({
                sendReasoning: false,
                // Plain-language surface for gateway failures, instead of a silent stall.
                onError: (error) => {
                  console.error("Chat stream error", error);
                  return getGatewayFailure(error).message;
                },
              }),
            );
          },
          onFinish: async ({ responseMessage }) => {
            mark("stream_finish");
            logTiming(usedModel);
            if (!userId || !threadId) return;

            // User message was published at request start for shared realtime delivery.
            const messageInsertError = await publishConversationMessage(supabase, {
              threadId,
              userId,
              role: responseMessage.role,
              parts: responseMessage.parts,
              sdkMessageId: responseMessage.id,
            });
            if (messageInsertError) console.error("Failed to persist messages", messageInsertError);

            const title = lastUserMessage ? textOf(lastUserMessage).slice(0, 60) : null;
            const updatedAt = new Date().toISOString();
            // Only the conversation owner can rename/touch the thread row under RLS.
            if (threadIsOwner) {
              const [titleUpdate, threadTouch] = await Promise.all([
                supabase
                  .from("threads")
                  .update({ updated_at: updatedAt, ...(title ? { title } : {}) })
                  .eq("id", threadId)
                  .eq("title", "New conversation"),
                supabase.from("threads").update({ updated_at: updatedAt }).eq("id", threadId),
              ]);
              if (titleUpdate.error) console.error("Failed to update thread", titleUpdate.error);
              if (threadTouch.error) console.error("Failed to touch thread", threadTouch.error);
            }
          },
        });

        const response = createUIMessageStreamResponse({
          stream,
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

