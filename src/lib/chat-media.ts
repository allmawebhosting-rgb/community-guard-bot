import type { UIMessage } from "ai";

/** Keep vision payloads small so uploads stay reliable and token usage stays bounded. */
export const CHAT_IMAGE_MAX_EDGE = 960;
export const CHAT_IMAGE_JPEG_QUALITY = 0.72;
/** ~600KB base64 ceiling — larger inlines often break /api/chat and leave the thread stuck. */
export const CHAT_INLINE_IMAGE_MAX_CHARS = 600_000;

export function isDataImageUrl(url: unknown): url is string {
  return typeof url === "string" && url.startsWith("data:image/");
}

export function dataUrlTooLarge(url: string): boolean {
  return url.length > CHAT_INLINE_IMAGE_MAX_CHARS;
}

/**
 * Drop heavy data:image payloads from older turns so later chat requests stay
 * under body limits and do not keep re-billing vision on every follow-up.
 * The latest user message keeps its images so Allma can still see the photo.
 */
export function slimMessagesForTransport(messages: UIMessage[]): UIMessage[] {
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      lastUserIndex = i;
      break;
    }
  }

  return messages.map((message, index) => {
    const keepInline = index === lastUserIndex && message.role === "user";
    let stripped = 0;
    const parts = message.parts.flatMap((part) => {
      if (part.type !== "file") return [part];
      const url = "url" in part && typeof part.url === "string" ? part.url : "";
      if (!isDataImageUrl(url)) {
        if (keepInline) return [part];
        // Signed/storage URLs from older turns are also skipped for model reuse;
        // the caption already records that a file was shared.
        stripped += 1;
        return [];
      }
      if (keepInline && !dataUrlTooLarge(url)) return [part];
      stripped += 1;
      return [];
    });

    if (stripped === 0) return message;

    const alreadyMentionsPhoto = parts.some(
      (part) =>
        part.type === "text" &&
        typeof part.text === "string" &&
        /photo|image|picture|file|attachment/i.test(part.text),
    );
    if (!alreadyMentionsPhoto && message.role === "user") {
      parts.push({
        type: "text",
        text:
          stripped === 1
            ? "(Earlier photo was shared in this chat.)"
            : `(${stripped} earlier photos were shared in this chat.)`,
      });
    }

    return { ...message, parts };
  });
}
