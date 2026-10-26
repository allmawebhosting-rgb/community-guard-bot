import { beforeEach, expect, it, vi } from "vitest";

const { createUser, profileUpsert } = vi.hoisted(() => ({
  createUser: vi.fn(),
  profileUpsert: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (value: unknown) => value;
    const builder = {
      validator: (fn: typeof validate) => {
        validate = fn;
        return builder;
      },
      handler: (fn: (input: { data: unknown }) => unknown) => (input: { data: unknown }) =>
        fn({ data: validate(input.data) }),
    };
    return builder;
  },
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    auth: { admin: { createUser } },
    from: () => ({ upsert: profileUpsert }),
  },
}));

import { signUpWithPhone } from "./phone-auth.functions";

const invoke = signUpWithPhone as unknown as (input: {
  data: { phone: string; password: string; fullName?: string };
}) => Promise<unknown>;

beforeEach(() => {
  vi.clearAllMocks();
});

it("reports an existing account only for a Supabase duplicate error", async () => {
  createUser.mockResolvedValue({
    data: { user: null },
    error: { code: "email_exists", status: 422, message: "User already registered" },
  });

  await expect(
    invoke({ data: { phone: "0770420951", password: "test-password" } }),
  ).resolves.toEqual({
    ok: false,
    code: "account_exists",
    error: "This phone number already has an account.",
  });
  expect(profileUpsert).not.toHaveBeenCalled();
});

it.each(["user_already_exists", "phone_exists"])(
  "recognizes the Supabase %s duplicate code",
  async (code) => {
    createUser.mockResolvedValue({
      data: { user: null },
      error: { code, status: 422, message: "Auth error" },
    });

    await expect(
      invoke({ data: { phone: "0770420951", password: "test-password" } }),
    ).resolves.toMatchObject({ ok: false, code: "account_exists" });
  },
);

it("returns the dedicated error for a weak password", async () => {
  createUser.mockResolvedValue({
    data: { user: null },
    error: { code: "weak_password", status: 422, message: "Password is too weak" },
  });

  await expect(
    invoke({ data: { phone: "0770420951", password: "123456" } }),
  ).resolves.toMatchObject({ ok: false, code: "weak_password" });
  expect(profileUpsert).not.toHaveBeenCalled();
});

it("does not mislabel unrelated auth errors as an existing account", async () => {
  createUser.mockResolvedValue({
    data: { user: null },
    error: {
      code: "unexpected_failure",
      status: 500,
      message: "Resource exists in upstream service",
    },
  });

  await expect(
    invoke({ data: { phone: "0770420951", password: "test-password" } }),
  ).resolves.toEqual({
    ok: false,
    code: "signup_failed",
    error: "We couldn't create your account. Please try again.",
  });
});

it("creates a profile after successful phone account creation", async () => {
  createUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
  profileUpsert.mockResolvedValue({ error: null });

  await expect(
    invoke({ data: { phone: "0770420951", password: "test-password", fullName: "Test User" } }),
  ).resolves.toEqual({ ok: true });
  expect(createUser).toHaveBeenCalledWith(
    expect.objectContaining({
      email: "p256770420951@phone.allmasafetyai.online",
      user_metadata: { full_name: "Test User", phone: "+256770420951" },
    }),
  );
  expect(profileUpsert).toHaveBeenCalledWith(
    { id: "user-1", phone: "+256770420951", full_name: "Test User" },
    { onConflict: "id" },
  );
});
