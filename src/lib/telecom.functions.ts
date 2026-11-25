/**
 * Compatibility re-export — GSM escalation lives in telecom-escalation.server
 * (Infobip `escalateSosToGsm`).
 */
export { escalateSosToGsm as triggerOfflineTelecomEscalation } from "@/lib/telecom-escalation.server";
export type { EscalateSosToGsmResult as TelecomEscalationClientResult } from "@/lib/telecom-escalation.server";
