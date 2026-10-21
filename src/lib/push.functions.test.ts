import { beforeEach, expect, it, vi } from "vitest";

const { rows, adminUpsert, userUpsert } = vi.hoisted(() => {
  const rows = new Map<string, Record<string, unknown>>();
  return { rows, adminUpsert: vi.fn(async (row: Record<string, unknown>) => {
    rows.set(String(row.endpoint), row);
    return { error: null };
  }), userUpsert: vi.fn() };
});
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  let validate = (value: unknown) => value;
  const builder = {
    middleware: () => builder,
    inputValidator: (fn: typeof validate) => { validate = fn; return builder; },
    handler: (fn: (input: unknown) => unknown) => (input: { data: unknown; context: unknown }) => fn({ ...input, data: validate(input.data) }),
  };
  return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => ({ upsert: adminUpsert }) } }));
import { savePushSubscription } from "./push.functions";

beforeEach(() => { rows.clear(); vi.clearAllMocks(); });
it("reassigns a shared device to the authenticated account without an RLS update", async () => {
  const endpoint = "https://push.example.test/device";
  rows.set(endpoint, { user_id: "previous-account", endpoint });
  const invoke = savePushSubscription as unknown as (input: unknown) => Promise<unknown>;
  await invoke({ data: { endpoint, p256dh: "encryption-key", auth: "secret-key" }, context: { userId: "current-account", supabase: { from: () => ({ upsert: userUpsert }) } } });
  expect(rows.size).toBe(1);
  expect(rows.get(endpoint)?.user_id).toBe("current-account");
  expect(rows.get(endpoint)?.auth_key).toBe("secret-key");
  expect(userUpsert).not.toHaveBeenCalled();
  expect(adminUpsert).toHaveBeenCalledWith(expect.objectContaining({ endpoint, user_id: "current-account" }), { onConflict: "endpoint" });
});