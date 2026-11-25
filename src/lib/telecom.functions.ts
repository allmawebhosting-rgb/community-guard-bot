/**
 * Compatibility re-export — GSM escalation now lives in telecom-escalation.server
 * (Africa's Talking `escalateSosToGsm`).
 */
export { escalateSosToGsm as triggerOfflineTelecomEscalation } from "@/lib/telecom-escalation.server";
export type { EscalateSosToGsmResult as TelecomEscalationClientResult } from "@/lib/telecom-escalation.server";
