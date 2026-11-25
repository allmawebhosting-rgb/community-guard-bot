import { classifyIncident, emergencyPromptBlock } from "@/lib/emergency-triage";
import { facilityKind } from "@/lib/facility-kind";
import { cleanAddress, KIND_LABEL, refineFacilities } from "@/lib/facility-results";
import { chooseSearchOrigin } from "@/lib/location-origin";
import { getSeededNearbyFacilities } from "@/lib/nearby-fallback";
import {
  isReportingIntent,
  canUseFilingTools,
  canUseCaseTimelineTool,
  isFilingToolName,
  isSoftGuidedFlow,
  isAppointmentBookingAsk,
  nearbyHelpTypesForTurn,
  isEmergencyNumbersAsk,
  isSosSituationQuestion,
  scriptedFlowOpener,
  shouldLoadReportingPrompt,
  shouldShowDirectHelp,
  sosSituationReply,
} from "@/lib/chat-intent";
import { assistantHasVisibleText } from "@/lib/chat-progress";
import { slimMessagesForTransport } from "@/lib/chat-media";
import { firstAidFor, matchIncident } from "@/lib/allma-emergency-playbook";
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
  type UIMessageChunk,
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
import { ALLMA_MARKER_CONTRACT, dedupeRepeatedParts, parseAllmaMarkers } from "@/lib/allma-markers";
import { facilitySearchInputSchema } from "@/lib/facility-search-input";
import {
  mergeCanonicalChatHistory,
  sharedThreadHasAssistantHistory,
  type SharedHistoryRow,
} from "@/lib/shared-chat-history";
import { publishConversationMessage } from "@/lib/publish-conversation-message";
import {
  bookHospitalAppointment,
  isBrowserAgentConfigured,
} from "@/lib/vps-browser-agent";


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
  /** Composer recipient for shared SOS chats: allma | responders. */
  recipient?: string | null;
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
    .filter((part) => part.type === "text")
    .map((part) => ("text" in part && typeof part.text === "string" ? part.text : ""))
    .join(" ")
    .trim();
}

/** Strip non-model parts (recipient metadata) before convertToModelMessages. */
function modelFacingMessages(messages: UIMessage[]): UIMessage[] {
  // Drop stale inline photos so follow-up turns stay under body limits and
  // do not re-bill vision on every message after a media upload.
  const slim = slimMessagesForTransport(messages);
  return slim.map((message) => ({
    ...message,
    parts: message.parts.filter((part) => {
      const type = (part as { type?: string }).type;
      return type !== "data-chat-recipient" && type !== "data-chat-progress" && type !== "data-reply" && type !== "data-sos-brief";
    }),
  }));
}

/**
 * Drop blocks the model repeated across (or within) this reply's text parts,
 * so the persisted/shared copy — and the history the model reads next turn —
 * shows each block once, matching what the chat UI renders.
 */
function dedupeAssistantParts(parts: UIMessage["parts"]): UIMessage["parts"] {
  const textIndexes: number[] = [];
  const texts: string[] = [];
  parts.forEach((part, index) => {
    if (part.type === "text") {
      textIndexes.push(index);
      texts.push(part.text);
    }
  });
  if (texts.length === 0) return parts;
  const cleaned = dedupeRepeatedParts(texts);
  if (cleaned.every((text, i) => text === texts[i])) return parts;
  const next = [...parts];
  textIndexes.forEach((partIndex, i) => {
    next[partIndex] = { ...next[partIndex], text: cleaned[i] } as (typeof parts)[number];
  });
  return next;
}

function emptyReplyFallback(
  intakeText: string,
  sos?: {
    personName?: string | null;
    emergencyType?: string | null;
    area?: string | null;
    locationShared?: boolean;
    situationCue?: string | null;
    participants?: string[];
    askerName?: string | null;
    personActiveInChat?: boolean | null;
  } | null,
): string {
  if (sos) {
    return sosSituationReply({
      personName: sos.personName,
      emergencyType: sos.emergencyType,
      area: sos.area,
      locationShared: sos.locationShared,
      situationCue: sos.situationCue,
      participants: sos.participants,
      askerName: sos.askerName,
      personActiveInChat: sos.personActiveInChat,
    });
  }
  const incident = matchIncident(intakeText);
  if (incident) {
    const aid = firstAidFor(incident);
    if (aid?.steps.length) {
      const steps = aid.steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
      const flags = aid.redFlags.length
        ? `\n\n**Get help now if:**\n${aid.redFlags.map((flag) => `- ${flag}`).join("\n")}`
        : "";
      const notDoctor = aid.notDoctor ? `\n\n${aid.notDoctor}` : "";
      return `${steps}${flags}${notDoctor}\n\n${incident.followUp}\n\n::suggest[${incident.followUpChips.join(" | ")}]`;
    }
  }
  if (/\breport\b|\bstolen\b|\btheft\b|\bcrime\b/i.test(intakeText)) {
    return 'I can guide you through reporting. What kind of incident is this?\n\n::suggest[Theft | Robbery | Assault | Something else]';
  }
  if (/\bhospital|police station|nearest|near me|find help\b/i.test(intakeText)) {
    return "Tell me a town or share your location, and I will look for the nearest help.\n\n::suggest[Share my location | Type a town | Emergency numbers]";
  }
  return "I am here to help with first aid, reporting, missing persons, lost & found, and nearby hospitals or police. What do you need right now?\n\n::suggest[First aid | Report a crime | Find help nearby | Emergency numbers]";
}

/** Pull a short human situation line from earlier user messages (e.g. nosebleed). */
function situationCueFromHistory(texts: string[]): string | null {
  for (let i = texts.length - 1; i >= 0; i--) {
    const text = texts[i]?.trim();
    if (!text) continue;
    if (isSosSituationQuestion(text)) continue;
    if (/^(hi|hey|hello|ok|okay|yes|no|thanks|thank you)[.!]?$/i.test(text)) continue;
    const incident = matchIncident(text);
    if (incident) {
      const clipped = text.replace(/\s+/g, " ").slice(0, 140);
      return clipped;
    }
    if (text.length >= 8 && text.length <= 140) return text.replace(/\s+/g, " ");
  }
  return null;
}

/** True when the person in need has a recent non-trivial user message in this thread. */
function personActiveFromHistory(texts: string[], personName?: string | null): boolean | null {
  if (!texts.length) return null;
  const first = (personName || "").trim().split(/\s+/)[0]?.toLowerCase() || "";
  for (let i = texts.length - 1; i >= 0; i--) {
    const text = texts[i]?.trim();
    if (!text || text.length < 4) continue;
    if (isSosSituationQuestion(text)) continue;
    if (/^(hi|hey|hello|ok|okay|yes|no|thanks|thank you)[.!]?$/i.test(text)) continue;
    // Prefer messages that look like the person describing their own emergency.
    if (/\b(i|my|me|i'm|im)\b/i.test(text) || matchIncident(text)) return true;
    if (first && text.toLowerCase().includes(first)) continue;
    return true;
  }
  return false;
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
        let sosActivityId: string | null = null;
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
          sosActivityId = context.sos_activity_id ?? null;
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
- Do not claim emergency services were contacted unless confirmed.
- TOPIC LOCK (HARD): Stay on THIS emergency only. Read the latest human message and the room situation, then do exactly what they asked (first aid, who joined, location, what to do next, call instructions). Do NOT open crime-report wizards, lost & found, Case Timeline, greetings, onboarding menus, or unrelated tools unless someone clearly asks for that by name.`
          : "";

        // SOS AGENT: on an active SOS the AI coordinates the room, so give
        // it the live room state (who needs help, who has joined, where)
        // straight from get_sos_room. Best-effort — the chat must never
        // fail because the agent layer could not load.
        let sosAgentBlock = "";
        let sosEmergencyType: string | null = null;
        let sosAskerName: string | null = null;
        let sosRoomSnapshot: {
          personName: string;
          emergencyType: string | null;
          area: string | null;
          locationShared: boolean;
          participants: string[];
        } | null = null;
        if (sharedSosActive && sosActivityId) {
          try {
            const { data: roomRows } = await (supabase as any).rpc("get_sos_room", {
              p_sos_id: sosActivityId,
            });
            const room = roomRows?.[0];
            if (room) {
              sosEmergencyType = typeof room.emergency_type === "string" ? room.emergency_type : null;
              const participants = Array.isArray(room.participants) ? room.participants : [];
              const participantNames = participants
                .map((person: { name?: string }) => person.name)
                .filter((name: unknown): name is string => typeof name === "string" && name.trim().length > 0);
              sosRoomSnapshot = {
                personName: String(room.sender_name ?? "the person in need"),
                emergencyType: sosEmergencyType,
                area: typeof room.area === "string" ? room.area : null,
                locationShared: Boolean(room.location_shared),
                participants: participantNames,
              };
              const people = participants.length
                ? participants
                    .map(
                      (person: {
                        name?: string;
                        role?: string;
                        user_id?: string;
                        connection_status?: string | null;
                      }) => {
                        // connection_status is the VOICE CALL state, not chat
                        // presence: everyone in this list has joined the room.
                        // Saying "disconnected" to the model made it describe
                        // people who were actively chatting as absent.
                        const status = (person.connection_status ?? "").toLowerCase();
                        const onCall = status === "connected" || status === "live" || status === "in_call";
                        return `${person.name ?? "Allma member"} (${person.role === "responder" ? "responder" : "safety contact"}, in this chat${onCall ? ", on a live voice call" : ""})`;
                      },
                    )
                    .join("; ")
                : "none yet — the Safety Network is still being called";
              const askerName =
                participants.find(
                  (person: { user_id?: string; name?: string }) =>
                    Boolean(userId) && person.user_id === userId && typeof person.name === "string",
                )?.name ?? null;
              const personFirst =
                String(room.sender_name ?? "the person in need").trim().split(/\s+/)[0] ||
                "the person in need";
              const askerFirst = askerName
                ? String(askerName).trim().split(/\s+/)[0]
                : "the person asking";
              const typeFocus =
                sosEmergencyType === "medical"
                  ? "Focus on medical first aid, bleeding control, breathing, and getting an ambulance if needed."
                  : sosEmergencyType === "crime"
                    ? "Focus on personal safety, escaping danger, describing the threat, and calling police 999/112."
                    : sosEmergencyType === "fire"
                      ? "Focus on getting people out safely, smoke/fire steps, and calling fire services / 999/112."
                      : "Focus on the danger described in the chat and the next safest action.";
              sosAgentBlock = `\n\nSOS AGENT — LIVE ROOM STATE (facts from the emergency system; never invent people, places, or statuses):
- Person in need: ${room.sender_name}.
- Emergency type: ${room.emergency_type}. Severity: ${room.severity}. Area: ${room.area}. Exact location shared: ${room.location_shared ? "yes" : "no"}.
- SOS started at ${room.created_at}.
- People currently in this room (use only for context — do NOT recite as a roster in replies): ${people}.
- The human you are answering right now: ${askerName ?? "a Safety Network contact"} (${threadIsOwner ? "conversation owner" : "responder / safety contact"}).
You are a calm, experienced human emergency coordinator — talk like a real person, not a product menu or system log:
- Read the latest human message carefully. DO exactly what they asked this turn (brief the situation, first-aid steps, what a responder should do, call 999/112, find nearest police/hospital/clinic, directions, or anything else they request for THIS emergency).
- When someone asks what is wrong / what happened / brief me / what is the problem with ${room.sender_name} (or "${personFirst}" / the person in need):
  • Address the asker by first name when known (e.g. "${askerFirst}, …").
  • In 2–3 calm, natural spoken sentences — like a real emergency dispatcher, not a database:
    – Summarize what ${personFirst} reported from recent chat (e.g. "He reported a bad nosebleed and swelling").
    – State location naturally (e.g. "His live GPS pin is updating on the map" or "We're still waiting for a precise pin").
    – Say whether ${personFirst} is active/messaging in this chat right now when that is clear.
  • End with ONE concrete next action for the responder (e.g. "Are you close enough to reach him?", "Can you call Police 999 while I keep him on the line?", or short first-aid steps).
  • NEVER print "What we know from this chat:", NEVER recite "In this chat now: …" rosters, NEVER dump product menus, welcome cards, or clinic directories unless they explicitly asked for places.
- If they ask for nearest police, hospital, clinic, ambulance, fire, or directions — call find_facilities immediately with those types. Do not refuse; do not change the subject.
- Do NOT reply with "I am here to help with first aid, reporting, missing persons…" or any onboarding menu while SOS is active.
- Do NOT dump clinic/hospital cards unprompted — only when they ask for nearby help or a place type.
- Uganda emergency numbers when needed: Police 999, Toll-free 112, Ambulance 911 (medical only). Never claim police/ambulance were dispatched unless a tool/backend confirms it.
- ${typeFocus}
- When a responder asks what to do, give them one clear job (call 999/112, go to the person, share location, or keep them calm in chat).
- Keep every reply short and useful. Never invent dispatches. Never print tool names.
- Everyone listed above as "in this chat" is present — never describe them as disconnected.`;
              if (typeof askerName === "string" && askerName.trim()) {
                sosAskerName = askerName.trim();
              }
            }
          } catch {
            sosAgentBlock = "";
          }
        }


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
        // AGENT FROM THE START: when an emergency has been reported but SOS
        // is not active yet, the agent still takes charge of the
        // conversation — coordinating first aid, location, and the move to
        // alert the Safety Network — instead of only answering questions.
        const agentTakeoverBlock =
          !sharedSosActive && (matchIncident(intakeText) ?? matchIncident(userConversationText))
            ? `\n\nAGENT TAKEOVER — AN EMERGENCY WAS REPORTED AND SOS IS NOT ACTIVE YET:
You are coordinating this emergency from the start, not just answering questions:
- Open by taking charge in one short line: say you are coordinating this with them and give the first thing to do.
- Give the first-aid steps for this emergency (the playbook guidance applies).
- Ask for their location once, so help can find them.
- Tell them clearly: tap "Activate SOS" and you will alert their Safety Network and coordinate everyone in this chat until help arrives.
- Keep that coordinator stance for the rest of the conversation: short, calm, one clear next step at a time.
- Never claim the Safety Network was alerted before the SOS is actually active.`
            : "";
        const hasSharedAssistantHistory = sharedThreadHasAssistantHistory(databaseHistory);
        // Deterministic companion to the takeover block above: the opener
        // line the stream guard guarantees on the first emergency reply (and
        // that onFinish mirrors into the saved message). Declared at handler
        // scope so both the stream transform and onFinish can use it.
        const takeoverOpener =
          !sharedSosActive && !hasSharedAssistantHistory && matchIncident(intakeText)
            ? "I'm coordinating this emergency with you — stay with me and follow my steps. Then tap \"Activate SOS\" and I'll alert your Safety Network and coordinate everyone in this chat until help arrives."
            : null;

        const { resolveMessageRecipient } = await import("@/lib/chat-recipient");
        const requestRecipient = resolveMessageRecipient({
          bodyRecipient: body.recipient,
          message: lastUserMessage as {
            metadata?: unknown;
            recipient?: unknown;
            parts?: unknown;
          } | null,
        });

        // Publish the human turn immediately so other participants see it over Realtime.
        if (userId && threadId && lastUserMessage) {
          const earlyError = await publishConversationMessage(supabase, {
            threadId,
            userId,
            role: "user",
            parts: lastUserMessage.parts,
            sdkMessageId: lastUserMessage.id,
            recipient: requestRecipient,
          });
          if (earlyError) {
            console.error("Failed to publish shared user message early", earlyError);
          }
        }

        // Human-only turns must never invoke Allma (no model, no empty assistant bubble).
        if (requestRecipient === "responders") {
          const stream = createUIMessageStream({
            originalMessages: uiMessages,
            execute: async () => {
              /* no assistant turn */
            },
          });
          return createUIMessageStreamResponse({ stream });
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
                recipient: "allma",
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

        const userHistoryTexts = uiMessages
          .filter((message) => message.role === "user")
          .map((message) => textOf(message));
        const sosSituationCue = situationCueFromHistory(userHistoryTexts);

        // Situation questions ("what is wrong with Allan?") stream through the
        // model with sosAgentBlock / topicSticky — never a fixed robotic script.

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
          ((softFlowActive && !emergencyFromIntake && !directService && shortSoftAnswer) ||
            (sharedSosActive && !emergencyFromIntake))
            ? uiMessages
                .filter((m) => m.role === "user")
                .map((m) => classifyIncident(textOf(m)))
                .find(Boolean) ?? null
            : null;
        const emergencyFromSosType =
          sharedSosActive && !emergencyFromIntake && !emergencyFromThread && sosEmergencyType
            ? sosEmergencyType === "fire"
              ? classifyIncident("there is a fire smoke burning")
              : sosEmergencyType === "crime"
                ? classifyIncident("someone attacked me crime assault danger")
                : sosEmergencyType === "medical"
                  ? classifyIncident("I am bleeding injured medical emergency first aid")
                  : null
            : null;
        const emergencyIncident =
          emergencyFromIntake ?? emergencyFromThread ?? emergencyFromSosType;
        const emergencyKind = emergencyIncident
          ? emergencyIncident.marker === "fire"
            ? "fire"
            : emergencyIncident.marker === "crime"
              ? "violence"
              : "medical"
          : null;
        // During a live SOS, never divert into report / lost-found / onboarding intents.
        const matchedIntent =
          sharedSosActive || emergencyKind
            ? undefined
            : INTENTS.find((i) => i.matches.test(intakeText));
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
        // Injury turns normally surface nearby help — except live SOS situation Q&A,
        // which must answer the emergency first (clinics only when clearly asked).
        const nearbyTypes = nearbyHelpTypesForTurn({
          directFacilityTypes,
          directService,
          emergencyHelpTypes: emergencyIncident?.helpTypes ?? [],
          isReporting,
          showDirectHelp: shouldShowHelp,
          sosActive: sharedSosActive,
          intakeText,
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
        // Booking intent must be resolved before intentBlock (used below).
        const bookingAsk = isAppointmentBookingAsk(intakeText);
        const wantsBooking = isBrowserAgentConfigured() && bookingAsk;
        const bookingBlock = bookingAsk
          ? wantsBooking
            ? `\n\nAPPOINTMENT BOOKING REQUEST: The user wants to book / schedule a medical appointment — do NOT call find_facilities and do NOT dump a clinic list unless they also asked for nearest/nearby places. Collect any missing details in ONE short question (hospital/clinic name, preferred time, reason for visit, patient name/phone if useful). When you have hospital_name + preferred_time + reason_for_visit, call book_hospital_appointment. If they already named a clinic (e.g. Jemia Doctors Chambers), use that name. Never invent a confirmation number — only report what the booking agent returns. End with ::suggest[…] options when you still need a choice.`
            : `\n\nAPPOINTMENT BOOKING REQUEST: The user asked to book an appointment, but the booking agent is not configured on this deployment. Do not pretend you booked anything. Tell them booking is temporarily unavailable, offer to list nearby clinics with find_facilities if they want, and remind Uganda emergency numbers if urgent (Ambulance 911, Toll-free 112, Police 999).`
          : "";
        const intentBlock = bookingBlock + directHelpBlock + (intent && continueGuidedFlow
          ? `\n\nTHE USER NAMED AN INTENT: ${intent.flow}. ${
              flowState.flowLabel
                ? `The flow is already running — ask the NEXT step, with a ::flow{type=${flowState.flowLabel}, step=${flowState.step + 1}, total=${Math.max(flowState.totalSteps, flowState.step + 1)}, title="…"} first line and a ::suggest[…] last line.`
                : `Open the "${intent.flow}" flow in THIS reply: first line ::flow{type=${intent.flow}, step=1, total=4, title="…"}, then this opening question: ${intent.opener} and end with a ::suggest[…] line carrying exactly those options.`
            } Do NOT ask this as plain prose without a ::suggest line, do NOT greet or introduce yourself, and stay strictly on this subject: never offer unrelated actions (emergency numbers, find help nearby, generate report) while this flow is running.`
          : intent && !flowState.flowLabel && !emergencyIncident && !requireNearbyHelp && !bookingAsk
            ? `\n\nTHE USER NAMED AN INTENT: ${intent.flow}. Open the "${intent.flow}" flow in THIS reply: first line ::flow{type=${intent.flow}, step=1, total=4, title="…"}, then this opening question: ${intent.opener} and end with a ::suggest[…] line carrying exactly those options. Do NOT ask this as plain prose without a ::suggest line, do NOT greet or introduce yourself, and stay strictly on this subject: never offer unrelated actions (emergency numbers, find help nearby, generate report) while this flow is running.`
          : "");


        // ---- Anti-repeat guard: the model must not restate its previous message.
        const lastAssistant = [...uiMessages].reverse().find((m) => m.role === "assistant");
        const lastAssistantText = lastAssistant ? textOf(lastAssistant).slice(0, 400) : "";
        const repeatBlock = lastAssistantText
          ? `\n\nYOUR PREVIOUS MESSAGE IN THIS CONVERSATION WAS: "${lastAssistantText}". Never repeat it or re-introduce yourself. Move the conversation forward instead.`
          : "";

        const modelMessages = await convertToModelMessages(modelFacingMessages(uiMessages));

        // Keep the active topic sticky so first-aid / reporting do not jump mid-thread.
        const priorUserTexts = uiMessages
          .filter((message) => message.role === "user")
          .slice(-4)
          .map((message) => textOf(message));
        const sosPersonActive = sharedSosActive
          ? personActiveFromHistory(userHistoryTexts, sosRoomSnapshot?.personName)
          : null;
        const topicSticky = sharedSosActive
          ? `\n\nTOPIC LOCK: SOS is active (${sosEmergencyType || "emergency"}) for ${sosRoomSnapshot?.personName || "the person in need"}.${sosSituationCue ? ` What they reported in chat: "${sosSituationCue}".` : ""}${sosAskerName ? ` You are speaking to ${sosAskerName} — use their first name.` : ""}${sosPersonActive === true ? " The person in need has been active in this chat." : sosPersonActive === false ? " No fresh message from the person in need just now." : ""} Speak like a calm human emergency dispatcher. Fulfill whatever they ask for THIS emergency. For "what happened / what's wrong / brief me": 2–3 natural sentences (condition + location + whether they are active in chat) then ONE next action. NEVER print "What we know from this chat:", NEVER list "In this chat now:", NEVER dump menus or unsolicited clinics. If they ask for nearest police/hospital, search those places. No Case Timeline, crime-report wizards, lost & found, greetings, or product menus.`
          : flowState.flowLabel === "Reporting" ||
              flowState.flowLabel === "Missing person" ||
              flowState.flowLabel === "Lost & found"
            ? `\n\nTOPIC LOCK: Stay on the "${flowState.flowLabel}" process until the user clearly changes subject. Ask the next missing detail. Do not open Case Timeline, first-aid cards, or unrelated tools.`
            : priorUserTexts.some((text) =>
                  /\b(first[- ]?aid|bleed|blood|cut|burn|unconscious|wound|injury|hurt)\b/i.test(text),
                ) && !isReporting
              ? `\n\nTOPIC LOCK: The user is seeking first-aid / medical guidance. Continue that subject with clear steps and one follow-up question. Do not open Case Timeline, crime-report flows, or unrelated cards unless they ask.`
              : "";

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
        if (
          isFirstTurn &&
          !sharedSosActive &&
          !intent &&
          !emergencyIncident &&
          !directService
        ) {
          promptBlocks.push(ALLMA_ONBOARDING_BLOCK);
        }
        if (hasReportContext && !sharedSosActive) promptBlocks.push(ALLMA_REPORTING_BLOCK);
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
          ...(wantsBooking ? (["book_hospital_appointment"] as const) : []),
        ]);
        const filingAllowed = canUseFilingTools({
          flowLabel: flowState.flowLabel,
          step: flowState.step,
          askedTitles: flowState.askedTitles,
        });
        const caseTimelineAllowed = canUseCaseTimelineTool({
          flowLabel: flowState.flowLabel,
          step: flowState.step,
          intakeText,
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
          if (!caseTimelineAllowed) {
            entries = entries.filter(([name]) => name !== "case_timeline");
          }
          // Emergency-number asks must never trigger facility/alert tools.
          if (isEmergencyNumbersAsk(intakeText)) {
            entries = entries.filter(([name]) => name !== "find_facilities" && name !== "list_alerts");
          }
          // Live SOS situation turns: keep the model off clinic search unless asked.
          if (sharedSosActive && !requireNearbyHelp) {
            entries = entries.filter(([name]) => name !== "find_facilities" && name !== "list_alerts");
          }
          if (!isBrowserAgentConfigured() || (!wantsBooking && !fullMode)) {
            entries = entries.filter(([name]) => name !== "book_hospital_appointment");
          }
          return Object.fromEntries(entries) as T;
        };

        const sosFallbackContext = sharedSosActive
          ? {
              personName: sosRoomSnapshot?.personName,
              emergencyType: sosRoomSnapshot?.emergencyType ?? sosEmergencyType,
              area: sosRoomSnapshot?.area,
              locationShared: sosRoomSnapshot?.locationShared,
              situationCue: sosSituationCue,
              participants: sosRoomSnapshot?.participants,
              askerName: sosAskerName,
              personActiveInChat: sosPersonActive,
            }
          : null;

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
          maxOutputTokens: emergencyIncident || requireNearbyHelp ? 700 : 512,
          abortSignal: request.signal,
          system: `${systemPrompt}\n\n${
            sharedSosActive && isSosSituationQuestion(intakeText) && !requireNearbyHelp
              ? `SOS REPLY RULE: Situation brief for a responder. Sound like a calm human dispatcher${sosAskerName ? ` speaking to ${sosAskerName.split(/\s+/)[0]}` : ""}. Example shape: "${sosAskerName ? sosAskerName.split(/\s+/)[0] + ", " : ""}${ (sosRoomSnapshot?.personName || "Allan").split(/\s+/)[0]} needs help — they reported ${sosSituationCue || "the emergency described in chat"}. ${sosRoomSnapshot?.locationShared ? "Their live GPS pin is updating on the map." : "We're still waiting for a precise location pin."} ${sosPersonActive === true ? "They've been messaging here." : "Check in with them in this chat."} Are you close enough to reach them, or should someone call Police 999 while I stay with them?" Use 2–3 natural sentences + one next action. NEVER print "What we know from this chat:", NEVER roster "In this chat now:", NEVER dump menus or clinics.`
              : sharedSosActive && !requireNearbyHelp
              ? "SOS REPLY RULE: Answer the latest human message about THIS emergency in plain words like a real coordinator and do what they asked. Do not force nearby-clinic cards unless they asked for places. Do not give the product welcome menu."
              : sharedSosActive && requireNearbyHelp
                ? "SOS REPLY RULE: They asked for nearby help. Call find_facilities for the requested types (police / hospital / clinic / etc.), show the places, and stay on THIS emergency. Do not give the product welcome menu."
                : PHYSICAL_SYMPTOM_FIRST_AID_RULE
          }\n\n${ALLMA_MARKER_CONTRACT}${sharedEmergencyBlock}${sosAgentBlock}${agentTakeoverBlock}\n\nThe user is ${
            userId ? "signed in, so reports can be filed." : "NOT signed in. You can still help and give guidance, but if they want a report filed, tell them to sign in first so their report is saved to their account."
          }${
            sharedSosActive
              ? threadIsOwner
                ? " This sender is the conversation owner during an active SOS."
                : " This sender is an authorized Safety Network responder in the shared SOS conversation — brief them on the emergency when they ask."
              : ""
          }${memoryBlock}${flowBlock}${coordBlock}${intentBlock}${repeatBlock}${topicSticky}\n\nRESPONSE RULES: Always write a clear user-facing text reply in this turn. Never return an empty message. Never call case_timeline unless the user is mid-report and needs progress milestones. Never invent unrelated Case Timeline / Done cards. Ask one clarifying question when details are missing instead of guessing.\n\nTURN BUDGET: exactly one reply per turn. Write your one message with its inline markers, then stop and wait for the user. Never continue on your own with extra explanations, tours, or a second question in the same turn.`,


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
            book_hospital_appointment: tool({
              description:
                "Dispatches the autonomous VPS browser agent to search Google, log in with stored credentials if required, fill the appointment form, and reserve a medical appointment. Use when the user asks to book / schedule / reserve a hospital or clinic appointment. Never invent a confirmation — only report what the agent returns. Never ask the user to paste portal passwords into chat.",
              inputSchema: z.object({
                hospital_name: z.string().describe("Name of the clinic or hospital"),
                preferred_time: z.string().describe("Preferred appointment time slot"),
                reason_for_visit: z.string().describe("Medical reason or symptoms"),
                patient_name: z.string().optional().describe("Patient full name if known"),
                phone_number: z.string().optional().describe("Patient phone if known"),
              }),
              execute: async ({
                hospital_name,
                preferred_time,
                reason_for_visit,
                patient_name,
                phone_number,
              }) => {
                reportProgress("finding");
                const result = await bookHospitalAppointment({
                  hospital_name,
                  preferred_time,
                  reason_for_visit,
                  patient_name,
                  phone_number,
                });
                reportProgress("writing");
                return {
                  ok: Boolean(result.success),
                  ...result,
                };
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
                "ONLY for an active crime / missing-person / lost-found report after real milestones exist (location collected, evidence uploaded, summary ready, report submitted). Never use for first aid, greetings, hospital search, or SOS. Pass ALL events collected so far each time. If you have no real milestones yet, do not call this tool — ask the next report question instead.",
              inputSchema: z.object({
                events: z.array(
                  z.object({
                    label: z.string().describe("What happened, e.g. 'Location received', 'Evidence uploaded'"),
                  }),
                ).min(1).describe("All timeline events so far, in chronological order"),
              }),
              execute: async (input) => {
                const events = (input.events ?? []).filter(
                  (event) => typeof event?.label === "string" && event.label.trim().length > 0,
                );
                if (!events.length) {
                  return { ok: false, message: "No timeline events yet." };
                }
                return {
                  ok: true,
                  events,
                  generated_at: new Date().toISOString(),
                };
              },
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
            // Never leave the user with a silent/empty assistant bubble — but
            // the fallback must land INSIDE this message, after its start
            // chunk. Writing it via a parallel `await result.text` raced the
            // merged stream: the fallback text arrived before the start
            // chunk, so the client rendered it as a separate bubble and the
            // same answer appeared twice. Instead, watch the chunks as they
            // flow past: hold the finish chunk, and if no text ever streamed,
            // append the fallback just before it.
            let streamedText = false;
            let heldFinish: UIMessageChunk | null = null;
            // AGENT TAKEOVER, guaranteed: on the first AI reply to a reported
            // emergency (SOS not active yet), the agent audibly takes charge
            // with a deterministic opener (takeoverOpener, handler scope) —
            // the small live model often streams no prose at all (markers +
            // tools only), so a prompt instruction alone never reaches the
            // user.
            let takeoverSent = false;
            const emitTakeover = (controller: TransformStreamDefaultController<UIMessageChunk>) => {
              if (!takeoverOpener || takeoverSent) return;
              takeoverSent = true;
              const takeoverId = `allma-takeover-${Date.now()}`;
              controller.enqueue({ type: "text-start", id: takeoverId });
              controller.enqueue({ type: "text-delta", id: takeoverId, delta: takeoverOpener });
              controller.enqueue({ type: "text-end", id: takeoverId });
            };
            const emptyReplyGuard = new TransformStream<UIMessageChunk, UIMessageChunk>({
              transform(chunk, controller) {
                if (chunk.type === "finish") {
                  heldFinish = chunk;
                  return;
                }
                // The opener must be the FIRST part of the message: emit it
                // right after the message start (before any tool chunks), or
                // just before the first text delta if no start was seen.
                // Parts render in order — an opener appended at the end
                // reads as an afterthought, not as taking charge.
                if (takeoverOpener && !takeoverSent && chunk.type === "start") {
                  controller.enqueue(chunk);
                  emitTakeover(controller);
                  return;
                }
                if (chunk.type === "text-delta" && chunk.delta.trim()) {
                  streamedText = true;
                  if (takeoverOpener && !takeoverSent) emitTakeover(controller);
                }
                controller.enqueue(chunk);
              },
              flush(controller) {
                if (!streamedText) {
                  emitTakeover(controller);
                  const fallback = emptyReplyFallback(intakeText, sosFallbackContext);
                  const fallbackId = `allma-empty-fallback-${Date.now()}`;
                  controller.enqueue({ type: "text-start", id: fallbackId });
                  controller.enqueue({ type: "text-delta", id: fallbackId, delta: fallback });
                  controller.enqueue({ type: "text-end", id: fallbackId });
                }
                if (heldFinish) controller.enqueue(heldFinish);
              },
            });
            writer.merge(
              result
                .toUIMessageStream({
                  sendReasoning: false,
                  // Plain-language surface for gateway failures, instead of a silent stall.
                  onError: (error) => {
                    console.error("Chat stream error", error);
                    return getGatewayFailure(error).message;
                  },
                })
                .pipeThrough(emptyReplyGuard),
            );
          },
          onFinish: async ({ responseMessage }) => {
            mark("stream_finish");
            logTiming(usedModel);
            if (!userId || !threadId) return;

            let parts = dedupeAssistantParts(responseMessage.parts);
            if (!assistantHasVisibleText(parts as Array<{ type: string; text?: string }>)) {
              parts = [
                ...parts,
                { type: "text", text: emptyReplyFallback(intakeText, sosFallbackContext) },
              ] as typeof responseMessage.parts;
            }
            // Mirror the stream guard in the saved message: the takeover
            // opener must be the FIRST part, exactly once. It can arrive as
            // a standalone part (stream guard), embedded at the start of
            // the fallback text, or not at all — normalize all three.
            if (takeoverOpener) {
              parts = parts
                .map((p) => {
                  if (
                    p.type === "text" &&
                    typeof (p as { text?: unknown }).text === "string" &&
                    ((p as { text: string }).text as string).startsWith(`${takeoverOpener}\n\n`)
                  ) {
                    return {
                      ...p,
                      text: ((p as { text: string }).text as string).slice(takeoverOpener.length + 2),
                    };
                  }
                  return p;
                })
                .filter(
                  (p) =>
                    !(
                      p.type === "text" &&
                      typeof (p as { text?: unknown }).text === "string" &&
                      ((p as { text: string }).text as string).trim() === ""
                    ),
                ) as typeof responseMessage.parts;
              const first = parts[0] as { type?: string; text?: unknown } | undefined;
              const openerAlreadyFirst =
                first?.type === "text" && typeof first.text === "string" && first.text === takeoverOpener;
              if (!openerAlreadyFirst) {
                // Drop any other standalone copy before prepending.
                parts = parts.filter(
                  (p) =>
                    !(
                      p.type === "text" &&
                      typeof (p as { text?: unknown }).text === "string" &&
                      ((p as { text: string }).text as string) === takeoverOpener
                    ),
                ) as typeof responseMessage.parts;
                parts = [{ type: "text", text: takeoverOpener }, ...parts] as typeof responseMessage.parts;
              }
            }

            // User message was published at request start for shared realtime delivery.
            const messageInsertError = await publishConversationMessage(supabase, {
              threadId,
              userId,
              role: responseMessage.role,
              parts,
              sdkMessageId: responseMessage.id,
              recipient: "allma",
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

