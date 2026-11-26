import { createFileRoute } from "@tanstack/react-router";
import { disconnectEmail } from "@/lib/gmail-connection.server";
import { userIdFromBearer } from "@/lib/request-auth.server";

export const Route = createFileRoute("/api/email/google/disconnect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await userIdFromBearer(request);
        if (!userId) return Response.json({ error: "sign_in_required" }, { status: 401 });
        const { revoked } = await disconnectEmail(userId);
        return Response.json({ ok: true, revoked }, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
