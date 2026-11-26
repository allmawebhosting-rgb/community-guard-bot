import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, CircleSlash, Loader2, Mail, MapPin, Phone, X } from "lucide-react";
import {
  advanceEmergencyContact,
  armEmergencyContact,
  cancelEmergencyContact,
} from "@/lib/emergency-contact.functions";
import { emergencyOrderSteps, type NetworkStageInfo, type OrderStepState } from "@/lib/sos-stage";
import type { EmergencyActionView, EmergencyRunView } from "@/lib/emergency-contact.server";

const TERMINAL = new Set(["completed", "cancelled", "no_facilities", "expired"]);

export function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.max(50, Math.round(meters / 10) * 10)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function secondsLeft(view: Pick<EmergencyRunView, "countdown_ends_at" | "server_now">, clockOffsetMs: number, now = Date.now()) {
  if (!view.countdown_ends_at) return null;
  const end = new Date(view.countdown_ends_at).getTime();
  return Math.max(0, Math.ceil((end - (now + clockOffsetMs)) / 1000));
}

function actionLabel(action: EmergencyActionView) {
  const what = action.channel === "call" ? "Call" : "Email";
  switch (action.status) {
    case "pending":
      return `${what}: waiting`;
    case "running":
      return action.channel === "call" ? "Calling now…" : "Sending email…";
    case "answered":
      return "Call answered";
    case "no_answer":
      return "No answer";
    case "sent":
      return "Email sent";
    case "failed":
      return `${what} failed`;
    case "skipped":
      return `${what} skipped`;
    case "cancelled":
      return `${what} cancelled`;
    default:
      return action.status;
  }
}

/** Provider sign-in errors mean no call was placed at all; say that plainly instead of an HTTP code. */
export function callDetailText(action: Pick<EmergencyActionView, "channel" | "status" | "detail">) {
  const detail = action.detail ?? "";
  if (action.channel === "call" && action.status === "failed" && /provider error (401|403)\b/i.test(detail)) {
    return "The calling service is not available right now, so no call was placed.";
  }
  return detail;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "running") return <Loader2 className="size-4 animate-spin text-red-600" aria-hidden />;
  if (status === "answered" || status === "sent") return <Check className="size-4 text-emerald-600" aria-hidden />;
  if (status === "failed" || status === "no_answer") return <X className="size-4 text-red-600" aria-hidden />;
  if (status === "cancelled" || status === "skipped") return <CircleSlash className="size-4 text-muted-foreground" aria-hidden />;
  return <span className="block size-2 rounded-full bg-muted-foreground/50" aria-hidden />;
}

export type EmergencyNetworkStatus = {
  sosActive: boolean;
  answered: string[];
  stage?: NetworkStageInfo | null;
  telecomMessage?: string | null;
};

/** One plain line per hospital: what actually happened with its call and email. */
export function hospitalStatusLines(view: EmergencyRunView | null): Array<{ name: string; text: string }> {
  if (!view) return [];
  const names = [...new Set(view.actions.map((a) => a.facility_name))];
  return names.map((name) => {
    const own = view.actions.filter((a) => a.facility_name === name);
    const call = own.find((a) => a.channel === "call");
    const email = own.find((a) => a.channel === "email");
    const parts: string[] = [];
    if (call?.status === "answered") parts.push("answered the call");
    else if (call?.status === "running") parts.push("calling now");
    else if (call?.status === "no_answer") parts.push("did not answer");
    else if (call?.status === "failed") parts.push("call failed");
    if (email?.status === "sent") parts.push("emailed");
    else if (email?.status === "running") parts.push("sending email");
    else if (email?.status === "failed") parts.push("email failed");
    return { name, text: parts.length ? parts.join(", ") : "waiting" };
  });
}

const STEP_DOT: Record<OrderStepState, string> = {
  waiting: "bg-muted-foreground/40",
  active: "bg-red-600 animate-pulse",
  done: "bg-emerald-600",
  skipped: "bg-muted-foreground/60",
};

/** The order SOS follows: Safety Network online, local calls to the network, then nearby help. */
export function EmergencyOrderSteps({
  network,
  nearbyStarted,
  nearbyFinished,
}: {
  network: EmergencyNetworkStatus;
  nearbyStarted: boolean;
  nearbyFinished: boolean;
}) {
  const steps = emergencyOrderSteps({
    info: network.sosActive ? (network.stage ?? null) : null,
    nearbyStarted,
    nearbyFinished,
    telecomMessage: network.telecomMessage,
  });
  return (
    <ol aria-label="Emergency order" className="mt-3 space-y-1.5 rounded-xl bg-background/80 p-3 text-[13px]">
      {steps.map((step, index) => (
        <li key={step.key} className="flex items-start gap-2">
          <span className={`mt-1.5 block size-2 shrink-0 rounded-full ${STEP_DOT[step.state]}`} aria-hidden />
          <span>
            <span className="font-semibold">
              {index + 1}. {step.title}
            </span>
            <span className="block text-xs text-muted-foreground">{step.note}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Live status: who was alerted, who answered, which hospital was contacted. */
export function EmergencyLiveStatus({
  network,
  view,
}: {
  network: EmergencyNetworkStatus;
  view: EmergencyRunView | null;
}) {
  const hospitals = hospitalStatusLines(view);
  const hospitalsStarted = view && view.status !== "countdown" && view.status !== "pending" && hospitals.length > 0;
  return (
    <dl aria-label="Live status" className="mt-3 space-y-1 rounded-xl bg-background/80 p-3 text-[13px]">
      <div className="flex gap-2">
        <dt className="w-28 shrink-0 font-semibold">Alerted</dt>
        <dd>{network.sosActive ? "Your emergency contacts and safety network" : "Starting SOS…"}</dd>
      </div>
      <div className="flex gap-2">
        <dt className="w-28 shrink-0 font-semibold">Answered</dt>
        <dd>{network.answered.length ? network.answered.join(", ") : "No one yet"}</dd>
      </div>
      {view ? (
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 font-semibold">Hospitals</dt>
          <dd>
            {hospitalsStarted
              ? hospitals.map((h) => `${h.name}: ${h.text}`).join(" · ")
              : view.status === "cancelled"
                ? "Cancelled"
                : "Not contacted yet"}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

export function EmergencyContactCard({
  run,
  searching,
  waitForSos,
  network,
}: {
  run: EmergencyRunView | null;
  searching?: boolean;
  /** Hold the hospital countdown until SOS is active (or the wait runs out): one step at a time. */
  waitForSos?: { sosActive: boolean; maxWaitMs: number; networkDone?: boolean };
  network?: EmergencyNetworkStatus | null;
}) {
  const arm = useServerFn(armEmergencyContact);
  const advance = useServerFn(advanceEmergencyContact);
  const cancel = useServerFn(cancelEmergencyContact);
  const [view, setView] = useState<EmergencyRunView | null>(run);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const offset = useRef(0);
  const loop = useRef(false);
  const stopped = useRef(false);

  const apply = useCallback((next: EmergencyRunView | null) => {
    if (!next) return;
    offset.current = new Date(next.server_now).getTime() - Date.now();
    setView(next);
  }, []);

  useEffect(() => {
    if (run && !view) setView(run);
  }, [run, view]);

  const [released, setReleased] = useState(!waitForSos);
  const holdSosActive = waitForSos?.sosActive ?? false;
  const holdMs = waitForSos?.maxWaitMs ?? 0;
  const holdNetworkDone = waitForSos?.networkDone;
  useEffect(() => {
    if (released || !waitForSos) return;
    if (holdNetworkDone === true || (holdNetworkDone === undefined && holdSosActive)) {
      setReleased(true);
      return;
    }
    const timer = setTimeout(() => setReleased(true), holdMs);
    return () => clearTimeout(timer);
  }, [released, waitForSos, holdSosActive, holdNetworkDone, holdMs]);

  const runId = view?.run_id ?? run?.run_id ?? null;
  useEffect(() => {
    if (!runId || !released) return;
    stopped.current = false;
    arm({ data: { runId } })
      .then(apply)
      .catch(() => setProblem("Could not start the countdown. Nothing was sent."));
    return () => {
      stopped.current = true;
    };
  }, [runId, released, arm, apply]);

  const status = view?.status ?? null;
  const endsAt = view?.countdown_ends_at ?? null;
  useEffect(() => {
    if (status !== "countdown" || !view || !endsAt) return;
    const tick = () => setRemaining(secondsLeft(view, offset.current));
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [status, endsAt, view]);

  const due = status === "running" || (status === "countdown" && remaining === 0);
  useEffect(() => {
    if (!runId || !due || loop.current) return;
    loop.current = true;
    (async () => {
      try {
        for (let step = 0; step < 24 && !stopped.current; step += 1) {
          const next = await advance({ data: { runId } });
          if (!next) break;
          apply(next);
          if (TERMINAL.has(next.status)) break;
          if (next.status === "countdown") await new Promise((resolve) => setTimeout(resolve, 400));
        }
      } catch {
        setProblem("Lost connection while contacting facilities. Reopen this chat to continue.");
      } finally {
        loop.current = false;
      }
    })();
  }, [due, runId, advance, apply]);

  if (!view) {
    return (
      <div role="status" className="rounded-2xl border-2 border-red-500/70 bg-red-50 p-4 text-sm dark:bg-red-950/30">
        <div className="flex items-center gap-2 font-semibold text-red-700 dark:text-red-300">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {searching === false ? "Could not look up nearby hospitals." : "Finding the nearest hospitals and clinics…"}
        </div>
      </div>
    );
  }

  const onCancel = async () => {
    setCancelling(true);
    try {
      apply(await cancel({ data: { runId: view.run_id } }));
    } catch {
      setProblem("Could not cancel. Check your connection and try again.");
    } finally {
      setCancelling(false);
    }
  };

  const counting = view.status === "countdown" && released;
  const active = counting || view.status === "running";
  const held = !released && !TERMINAL.has(view.status);
  const heading = held
    ? "Nearby help comes last"
    : view.status === "no_facilities"
      ? "No hospital with a real phone number or email found nearby"
      : view.status === "cancelled"
        ? "Contacting hospitals was cancelled"
        : view.status === "expired"
          ? "Contacting hospitals did not start"
          : counting
            ? `Contacting nearby hospitals in ${remaining ?? 10} s`
            : view.status === "running"
              ? "Contacting nearby hospitals now"
              : "Nearby hospitals have been contacted";

  const emailActions = view.actions.filter((a) => a.channel === "email");
  const callActions = view.actions.filter((a) => a.channel === "call");

  return (
    <section
      aria-label="Emergency contact"
      className="rounded-2xl border-2 border-red-500/70 bg-red-50 p-4 text-sm text-foreground shadow-sm dark:bg-red-950/30"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden />
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-tight text-red-700 dark:text-red-300" aria-live="polite">
            {heading}
          </h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" aria-hidden />
            {view.incident}
            {view.place ? ` · ${view.location_source === "gps" ? "near" : "in"} ${view.place}` : ""}
          </p>
        </div>
      </div>

      {view.facilities.length > 0 ? (
        <ol className="mt-3 space-y-2">
          {view.facilities.map((facility) => (
            <li key={`${facility.name}-${facility.phone ?? facility.email}`} className="rounded-xl bg-background/80 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{facility.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDistance(facility.distance_m)}</span>
              </div>
              {facility.address ? <p className="text-xs text-muted-foreground">{facility.address}</p> : null}
              {facility.open_note ? <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{facility.open_note}</p> : null}
              <div className="mt-1 space-y-0.5 text-xs">
                {facility.phone ? (
                  <p className="flex items-center gap-1.5"><Phone className="size-3" aria-hidden />+{facility.phone}</p>
                ) : null}
                {facility.email ? (
                  <p className="flex items-center gap-1.5 break-all"><Mail className="size-3 shrink-0" aria-hidden />{facility.email}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      {held ? (
        <p className="mt-3 text-xs text-muted-foreground">
          These are the nearest. They are called one by one after your Safety Network.
        </p>
      ) : null}

      {network ? (
        <EmergencyOrderSteps
          network={network}
          nearbyStarted={released && !held}
          nearbyFinished={view.status === "completed"}
        />
      ) : null}

      {network ? <EmergencyLiveStatus network={network} view={view} /> : null}

      {counting && released ? (
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling}
          className="mt-4 w-full rounded-xl bg-red-600 px-4 py-4 text-lg font-bold text-white shadow active:scale-[0.99] disabled:opacity-60"
        >
          {cancelling ? "Cancelling…" : "Cancel"}
        </button>
      ) : null}

      {!counting && view.actions.length > 0 ? (
        <div className="mt-3 space-y-3" aria-live="polite">
          {[
            { title: "Emails", items: emailActions },
            { title: "Calls", items: callActions },
          ]
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <div key={group.title}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
                <ul className="space-y-1">
                  {group.items.map((action) => (
                    <li key={action.id} className="flex items-start gap-2 text-[13px]">
                      <span className="mt-1 flex w-4 justify-center"><StatusIcon status={action.status} /></span>
                      <span>
                        <span className="font-medium">{action.facility_name}</span>
                        {" — "}
                        {actionLabel(action)}
                        {action.detail && action.status !== "running" && action.status !== "pending" ? (
                          <span className="block text-xs text-muted-foreground">{callDetailText(action)}</span>
                        ) : null}
                        {action.channel === "call" && action.status === "failed" && /^\+?\d{6,}$/.test(action.destination) ? (
                          <a
                            href={`tel:+${action.destination.replace(/^\+/, "")}`}
                            className="mt-1 inline-block rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white"
                          >
                            Call {action.facility_name} yourself
                          </a>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      ) : null}

      {view.actions.some((a) => a.channel === "email") && view.status !== "cancelled" ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {view.email_via === "gmail"
            ? `Emails go from your Gmail (${view.gmail_email}).`
            : "Gmail is not connected, so emails go from Allma's own system email."}
        </p>
      ) : null}
      {active ? (
        <p className="mt-2 text-xs text-muted-foreground">Keep this chat open until it finishes. This never dials 999, 112 or 911 — call them yourself if you can.</p>
      ) : null}
      {problem ? <p role="alert" className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">{problem}</p> : null}
    </section>
  );
}
