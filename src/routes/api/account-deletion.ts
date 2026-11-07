import { createFileRoute } from "@tanstack/react-router";
import { createClient, type User } from "@supabase/supabase-js";
import {
  getJwtAuthTime,
  getOwnedAvatarStorageReference,
  isAccountDeletionEnabled,
  isRecentGoogleAuthentication,
} from "@/lib/account-deletion-policy";

function createPublicAuthClient(url: string, key: string) {
  return createClient(url, key, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(
          typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
        );
        if (init?.headers) {
          new Headers(init.headers).forEach((value, name) => headers.set(name, value));
        }
        if (
          (key.startsWith("sb_publishable_") || key.startsWith("sb_secret_")) &&
          headers.get("Authorization") === `Bearer ${key}`
        ) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function providerFor(user: User): string | null {
  if (typeof user.app_metadata?.provider === "string") return user.app_metadata.provider;
  return user.identities?.find((identity) => identity.provider === "google")?.provider ?? null;
}

async function removeAvatarWithRetry(
  admin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  bucket: string,
  path: string,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { error } = await admin.storage.from(bucket).remove([path]);
      if (!error) return true;
      if (/not found|does not exist|no such object/i.test(error.message)) return true;
    } catch {
      // Storage cleanup is best-effort after Auth has confirmed deletion.
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt));
  }
  return false;
}

export const Route = createFileRoute("/api/account-deletion")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAccountDeletionEnabled(process.env.ACCOUNT_DELETION_ENABLED)) {
          return Response.json(
            { error: "Account deletion is not currently available." },
            { status: 404 },
          );
        }

        const token = request.headers
          .get("authorization")
          ?.replace(/^Bearer\s+/i, "")
          .trim();
        if (!token) return Response.json({ error: "Sign in is required." }, { status: 401 });

        const url = process.env.SUPABASE_URL;
        const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!url || !publicKey) {
          return Response.json({ error: "Account deletion is unavailable." }, { status: 503 });
        }

        let body: { password?: unknown };
        try {
          const parsed: unknown = await request.json();
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return Response.json({ error: "A valid confirmation is required." }, { status: 400 });
          }
          body = parsed as { password?: unknown };
        } catch {
          return Response.json({ error: "A valid confirmation is required." }, { status: 400 });
        }
        if (
          body.password !== undefined &&
          (typeof body.password !== "string" ||
            body.password.length < 6 ||
            body.password.length > 72)
        ) {
          return Response.json({ error: "The PIN or password is not valid." }, { status: 400 });
        }

        const authClient = createPublicAuthClient(url, publicKey);
        const { data: verified, error: authError } = await authClient.auth.getUser(token);
        if (authError || !verified.user) {
          return Response.json(
            { error: "Your session has expired. Sign in again." },
            { status: 401 },
          );
        }

        const user = verified.user;
        let recentlyReauthenticated = false;
        if (typeof body.password === "string") {
          const credentials = user.email
            ? { email: user.email, password: body.password }
            : user.phone
              ? { phone: user.phone, password: body.password }
              : null;
          if (!credentials) {
            return Response.json(
              { error: "Recent account verification is required." },
              { status: 403 },
            );
          }

          const reauthClient = createPublicAuthClient(url, publicKey);
          const { data: reauth, error: reauthError } =
            await reauthClient.auth.signInWithPassword(credentials);
          if (reauthError || reauth.user?.id !== user.id || !reauth.session?.access_token) {
            return Response.json(
              { error: "The PIN or password could not be verified." },
              { status: 403 },
            );
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error: revokeError } = await supabaseAdmin.auth.admin.signOut(
            reauth.session.access_token,
            "local",
          );
          if (revokeError) {
            return Response.json(
              { error: "Could not complete account verification." },
              { status: 503 },
            );
          }
          recentlyReauthenticated = true;
        } else {
          recentlyReauthenticated = isRecentGoogleAuthentication(
            providerFor(user),
            getJwtAuthTime(token),
          );
        }

        if (!recentlyReauthenticated) {
          return Response.json(
            { error: "Recent account verification is required." },
            { status: 403 },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: profile, error: profileError } = await supabaseAdmin
          .from("profiles")
          .select("avatar_url")
          .eq("id", user.id)
          .maybeSingle();
        if (profileError) {
          return Response.json({ error: "Could not prepare account deletion." }, { status: 500 });
        }

        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
        if (deleteError) {
          return Response.json(
            { error: "Account deletion could not be completed." },
            { status: 500 },
          );
        }

        const avatar = getOwnedAvatarStorageReference(profile?.avatar_url, user.id, url);
        const avatarRemoved = avatar
          ? await removeAvatarWithRetry(supabaseAdmin, avatar.bucket, avatar.path)
          : true;
        if (!avatarRemoved) {
          console.warn("[account-deletion] Avatar cleanup needs a retry.");
        }

        return Response.json({ ok: true, avatarCleanupPending: !avatarRemoved });
      },
    },
  },
});
