/* Allma Safety AI service worker — background incoming-call alerts. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Allma Safety AI", body: event.data ? event.data.text() : "" };
  }

  const callId = payload.callId || "";
  const title = payload.title || "Incoming Allma call";
  const body = payload.body || "Someone is calling you on Allma.";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: callId ? `call-${callId}` : "allma-call",
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 200],
      data: { callId, type: payload.type || "incoming_call" },
      actions: [
        { action: "answer", title: "Answer" },
        { action: "decline", title: "Decline" },
      ],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const callId = (event.notification.data && event.notification.data.callId) || "";

  if (event.action === "decline") {
    // Declining happens in the app; without a window we simply dismiss.
    return;
  }

  const target = callId ? `/calls?call=${encodeURIComponent(callId)}` : "/calls";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          client.postMessage({ type: "allma:answer-call", callId });
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
