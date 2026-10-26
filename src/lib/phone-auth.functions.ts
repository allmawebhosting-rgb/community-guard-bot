import { createServerFn } from "@tanstack/react-start";
import { isLikelyValidPhone, normalizePhone } from "@/lib/phone";
import { phoneLoginEmail } from "@/lib/phone-auth";

type Input = { phone: string; password: string; fullName?: string };

/** Creates a phone-number account (already confirmed) so sign-up needs no email. */
export const signUpWithPhone = createServerFn({ method: "POST" })
  .validator((input: Input) => {
    if (!input || typeof input.phone !== "string" || !isLikelyValidPhone(input.phone)) {
      throw new Error("Enter a valid phone number.");
    }
    if (typeof input.password !== "string" || input.password.length < 6 || input.password.length > 72) {
      throw new Error("Your PIN or password needs at least 6 characters.");
    }
    const fullName = typeof input.fullName === "string" ? input.fullName.trim().slice(0, 80) : "";
    return { phone: input.phone, password: input.password, fullName };
  })
  .handler(async ({ data }) => {
    const e164 = normalizePhone(data.phone)!;
    const email = phoneLoginEmail(e164)!;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName || null, phone: e164 },
    });
    if (error || !created.user) {
      if (/weak|guess|pwned/i.test(error?.message ?? "")) {
        return {
          ok: false as const,
          code: "weak_password" as const,
          error: "That PIN is too easy to guess. Please choose a stronger one (mix numbers and letters).",
        };
      }
      const accountExists =
        error?.code === "email_exists" ||
        error?.code === "user_already_exists" ||
        error?.code === "phone_exists" ||
        /user already registered/i.test(error?.message ?? "");
      console.error("[Auth] Phone signup failed", {
        code: error?.code ?? "unknown",
        status: error?.status ?? null,
      });
      return accountExists
        ? {
            ok: false as const,
            code: "account_exists" as const,
            error: "This phone number already has an account.",
          }
        : {
            ok: false as const,
            code: "signup_failed" as const,
            error: "We couldn't create your account. Please try again.",
          };
    }
    await supabaseAdmin
      .from("profiles")
      .upsert({ id: created.user.id, phone: e164, full_name: data.fullName || null }, { onConflict: "id" });
    return { ok: true as const };
  });
