import { createCipheriv, randomBytes } from "crypto";

export type ZegoServerAssistant = {
  generateToken04: (
    appId: number,
    userId: string,
    serverSecret: string,
    effectiveTimeInSeconds: number,
    payload?: string,
  ) => string;
};

/**
 * ZEGOCLOUD token04 generator implemented locally.
 * The official `zego-server-assistant` package is not published on npm, so the
 * documented algorithm (AES-CBC over a JSON payload) is implemented here.
 */
function generateToken04(
  appId: number,
  userId: string,
  serverSecret: string,
  effectiveTimeInSeconds: number,
  payload = "",
): string {
  if (!appId || !userId || serverSecret.length !== 32 || effectiveTimeInSeconds <= 0) {
    throw new Error("ZEGOCLOUD credentials are invalid.");
  }
  const createTime = Math.floor(Date.now() / 1000);
  const nonce = Math.floor(Math.random() * 2147483647) - 1073741823;
  const body = JSON.stringify({
    app_id: appId,
    user_id: userId,
    nonce,
    ctime: createTime,
    expire: createTime + effectiveTimeInSeconds,
    payload,
  });

  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", Buffer.from(serverSecret), iv);
  const ciphertext = Buffer.concat([cipher.update(body, "utf8"), cipher.final()]);

  const buffer = Buffer.alloc(8 + 2 + iv.length + 2 + ciphertext.length);
  let offset = 0;
  buffer.writeBigInt64BE(BigInt(createTime + effectiveTimeInSeconds), offset);
  offset += 8;
  buffer.writeUInt16BE(iv.length, offset);
  offset += 2;
  iv.copy(buffer, offset);
  offset += iv.length;
  buffer.writeUInt16BE(ciphertext.length, offset);
  offset += 2;
  ciphertext.copy(buffer, offset);

  return `04${buffer.toString("base64")}`;
}

export async function loadZegoServerAssistant(): Promise<ZegoServerAssistant> {
  return { generateToken04 };
}
