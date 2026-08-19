type VoiceGrantCtor = new (options: {
  outgoingApplicationSid: string;
  incomingAllow: boolean;
}) => unknown;

type AccessTokenInstance = {
  addGrant: (grant: unknown) => void;
  toJwt: () => string;
};

type AccessTokenCtor = (new (
  accountSid: string,
  apiKey: string,
  apiSecret: string,
  options: { identity: string; ttl: number },
) => AccessTokenInstance) & { VoiceGrant: VoiceGrantCtor };

type VoiceResponseDial = {
  client: (identity: string) => {
    parameter: (options: { name: string; value: string }) => void;
  };
};

type VoiceResponseInstance = {
  dial: (options: Record<string, unknown>) => VoiceResponseDial;
  toString: () => string;
};

export type TwilioServer = {
  jwt: { AccessToken: AccessTokenCtor };
  validateRequest: (
    authToken: string,
    signature: string,
    url: string,
    params: Record<string, string>,
  ) => boolean;
  twiml: { VoiceResponse: new () => VoiceResponseInstance };
};

export type TwilioModule = { default: TwilioServer };

export async function loadTwilio(): Promise<TwilioServer> {
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
