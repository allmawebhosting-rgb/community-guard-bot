export type ZegoServerAssistant = {
  generateToken04: (
    appId: number,
    userId: string,
    serverSecret: string,
    effectiveTimeInSeconds: number,
    payload?: string,
  ) => string;
};

export async function loadZegoServerAssistant(): Promise<ZegoServerAssistant> {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<{ generateToken04?: ZegoServerAssistant["generateToken04"] }>;
    const module = await dynamicImport("zego-server-assistant");
    if (!module.generateToken04) throw new Error("Zego token generator is unavailable.");
    return { generateToken04: module.generateToken04 };
  } catch {
    throw new Error("ZEGOCLOUD server package is not installed.");
  }
}
