import { createServerFn } from "@tanstack/react-start";
import { isLikelyValidPhone, normalizePhone } from "@/lib/phone";
import { phoneLoginEmail } from "@/lib/phone-auth";

type Input = { phone: string; password: string; fullName?: string };

/** Creates a phone-number account (already confirmed) so sign-up needs no email. */
export const signUpWithPhone = createServerFn({ method: "POST" })
  .inputValidator((input: Input) => {
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
      const exists = /already|registered|exists/i.test(error?.message ?? "");
      return { ok: false as const, error: exists ? "This phone number already has an account. Please sign in." : "We couldn't create your account. Please try again." };
    }
    await supabaseAdmin
      .from("profiles")
      .update({ phone: e164, ...(data.fullName ? { full_name: data.fullName } : {}) })
      .eq("id", created.user.id);
    return { ok: true as const };
  });
