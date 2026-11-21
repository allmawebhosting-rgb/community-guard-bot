/* Allma Safety AI service worker — Web Push for background SOS / call alerts. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function parsePushPayload(event) {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Allma Safety AI", body: event.data ? event.data.text() : "" };
  }
  return payload || {};
}

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);
  const callId = payload.callId || "";
  const invitationId = payload.invitationId || "";
  const activityId = payload.activityId || "";
  const threadId = payload.threadId || "";
  const type = payload.type || "incoming_call";
  const isEmergency = type === "incoming_emergency_call";
  const isSosActivity = type === "sos_activity" || type === "sos_activated" || type === "sos_resolved";
  const isResponderJoined = type === "responder_joined";
  const title =
    payload.title ||
    (isEmergency
      ? "ALLMA EMERGENCY CALL"
      : isSosActivity
        ? "ALLMA SOS ALERT"
        : isResponderJoined
          ? "Responder joined"
          : "Incoming Allma call");
  const body =
    payload.body ||
    (isEmergency
      ? "Urgent assistance requested."
      : isSosActivity
        ? "A Safety Network member needs help."
        : isResponderJoined
          ? "A responder joined your emergency conversation."
          : "Someone is calling you on Allma.");

  const tag = isResponderJoined
    ? `responder-joined-${activityId || "alert"}`
    : isSosActivity
      ? `sos-activity-${activityId || "alert"}`
      : invitationId
        ? `emergency-invitation-${invitationId}`
        : callId
          ? `call-${callId}`
          : "allma-call";

  event.waitUntil(
    (async () => {
      // If an Allma tab is focused, wake it instead of stacking a duplicate OS banner
      // for non-call alerts. Incoming calls still show a system notification.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      let focused = false;
      for (const client of windows) {
        if (client.focused) {
          focused = true;
          client.postMessage({
            source: "allma-sw",
            type: "allma-push",
            payload: { ...payload, callId, invitationId, activityId, threadId, type },
          });
        }
      }
      if (focused && !isEmergency) return;

      await self.registration.showNotification(title, {
        body,
        tag,
        renotify: true,
        requireInteraction: isEmergency || isSosActivity,
        vibrate: isEmergency ? [220, 80, 220, 80, 220] : [160, 80, 160],
        data: {
          callId,
          invitationId,
          activityId,
          threadId,
          type,
        },
        actions: [
          {
            action: isEmergency ? "answer" : "open",
            title: isEmergency ? "Answer" : "Open",
          },
          { action: "decline", title: "Dismiss" },
        ],
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const callId = data.callId || "";
  const invitationId = data.invitationId || "";
  const activityId = data.activityId || "";
  const threadId = data.threadId || "";
  const type = data.type || "";

  if (event.action === "decline") {
    return;
  }

  let target = "/calls";
  if (type === "sos_activity" || type === "sos_activated" || type === "sos_resolved" || type === "responder_joined") {
    target = threadId
      ? `/chat/${encodeURIComponent(threadId)}`
      : activityId
        ? `/calls?room=${encodeURIComponent(activityId)}`
        : "/calls";
  } else if (invitationId) {
    target = `/calls?invitation=${encodeURIComponent(invitationId)}${
      callId ? `&call=${encodeURIComponent(callId)}` : ""
    }`;
  } else if (callId) {
    target = `/calls?call=${encodeURIComponent(callId)}`;
  }

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          if (typeof client.navigate === "function") await client.navigate(target);
          client.postMessage({
            source: "allma-sw",
            type: "allma-notification-open",
            payload: { callId, invitationId, activityId, threadId, target },
          });
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
