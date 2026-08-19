export type TwilioModule = {
  default: {
    jwt: {
      AccessToken: new (
        accountSid: string,
        apiKey: string,
        apiSecret: string,
        options: { identity: string; ttl: number },
      ) => {
        addGrant: (grant: unknown) => void;
        toJwt: () => string;
      };
      AccessToken: {
        VoiceGrant: new (options: {
          outgoingApplicationSid: string;
          incomingAllow: boolean;
        }) => unknown;
      };
    };
    validateRequest: (
      authToken: string,
      signature: string,
      url: string,
      params: Record<string, string>,
    ) => boolean;
    twiml: { VoiceResponse: new () => unknown };
  };
};

export async function loadTwilio(): Promise<TwilioModule["default"]> {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<TwilioModule>;
    const module = await dynamicImport("twilio");
    return module.default;
  } catch {
    throw new Error("Twilio server package is not installed.");
  }
}
