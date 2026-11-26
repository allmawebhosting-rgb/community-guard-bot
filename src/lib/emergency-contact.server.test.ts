import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let idCounter = 0;

class Query {
  private filters: Array<(row: Row) => boolean> = [];
  private op: "select" | "insert" | "update" = "select";
  private payload: Row | Row[] | null = null;
  private sorter: { column: string; ascending: boolean } | null = null;
  private max = Infinity;
  private head = false;
  private wantRows = true;
  constructor(private table: string) {}
  select(_cols?: string, opts?: { head?: boolean }) {
    this.head = Boolean(opts?.head);
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }
  lt(column: string, value: string) {
    this.filters.push((row) => String(row[column]) < value);
    return this;
  }
  gte(column: string, value: string) {
    this.filters.push((row) => String(row[column]) >= value);
    return this;
  }
  is(column: string, value: unknown) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  orderBy(column: string, ascending: boolean) {
    this.sorter = { column, ascending };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    return this.run().then((r) => ({ data: (r.data as Row[] | null)?.[0] ?? null, error: null }));
  }
  single() {
    return this.run().then((r) => ({ data: (r.data as Row[] | null)?.[0] ?? null, error: null }));
  }
  then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
    return this.run().then(resolve, reject);
  }
  private async run() {
    const rows = (tables[this.table] ??= []);
    const now = new Date().toISOString();
    if (this.op === "insert") {
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      const created = items.map((item) => {
        const base: Row = { id: `00000000-0000-4000-8000-${String(++idCounter).padStart(12, "0")}`, created_at: now, updated_at: now };
        if (this.table === "emergency_contact_actions") base.status = "pending";
        if (this.table === "emergency_contact_runs") base.countdown_ends_at = null;
        const row = { ...base, ...item };
        rows.push(row);
        return row;
      });
      return { data: created, error: null };
    }
    let matched = rows.filter((row) => this.filters.every((f) => f(row)));
    if (this.op === "update") {
      for (const row of matched) Object.assign(row, this.payload);
      return { data: matched, error: null };
    }
    if (this.sorter) {
      const { column, ascending } = this.sorter;
      matched = [...matched].sort((a, b) => (Number(a[column]) - Number(b[column])) * (ascending ? 1 : -1) || String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1));
    }
    if (this.head) return { data: null, count: matched.length, error: null };
    return { data: matched.slice(0, this.max), error: null };
  }
}
// `order(column, {ascending})` is the supabase signature.
(Query.prototype as unknown as { order: unknown }).order = function (this: Query, column: string, opts?: { ascending?: boolean }) {
  return this.orderBy(column, opts?.ascending !== false);
};

const fakeDb = {
  from: (table: string) => new Query(table),
  auth: { admin: { getUserById: async () => ({ data: { user: { email: "me@account.test" } } }) } },
};

const callFacility = vi.fn();
const sendGmail = vi.fn();
const sendSystemTextEmail = vi.fn();
const getEmailConnection = vi.fn();
const findEmergencyFacilities = vi.fn();

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: fakeDb }));
vi.mock("@/lib/facility-call.server", () => ({ callFacility: (...args: unknown[]) => callFacility(...args) }));
vi.mock("@/lib/gmail-connection.server", () => ({
  sendGmail: (...args: unknown[]) => sendGmail(...args),
  getEmailConnection: (...args: unknown[]) => getEmailConnection(...args),
}));
vi.mock("@/lib/agent-email.server", () => ({ sendSystemTextEmail: (...args: unknown[]) => sendSystemTextEmail(...args) }));
vi.mock("@/lib/emergency-facilities.server", () => ({
  findEmergencyFacilities: (...args: unknown[]) => findEmergencyFacilities(...args),
  reverseGeocode: async () => "Main Street, Jinja, Uganda",
}));

import { advanceEmergencyRun, armEmergencyRun, cancelEmergencyRun, startEmergencyRun } from "./emergency-contact.server";

const USER = "user-1";
const facility = (name: string, phone: string | null, email: string | null, distance_m: number) => ({
  id: name,
  name,
  type: "hospital",
  address: `${name} road`,
  phone,
  website: null,
  email,
  distance_m,
  open_now: true,
  is_24h: false,
  latitude: 0.42,
  longitude: 33.2,
  source: "google" as const,
});

const startInput = {
  userId: USER,
  threadId: "thread-1",
  sosActivityId: null,
  trigger: "chat" as const,
  incident: { label: "Road / boda boda accident" },
  reportText: "I was in a boda boda accident, I'm in Jinja",
  placeTexts: ["I was in a boda boda accident, I'm in Jinja"],
  coords: null as { latitude: number; longitude: number } | null,
};

async function start(over: Partial<typeof startInput> = {}) {
  const result = await startEmergencyRun({ ...startInput, ...over });
  if (!result.ok || result.reused) throw new Error(`unexpected ${JSON.stringify(result)}`);
  return result.view;
}

/** Arms, lets the countdown elapse, then advances until the run stops. */
async function runToEnd(runId: string) {
  await armEmergencyRun(USER, runId);
  (tables["emergency_contact_runs"]![0] as Row).countdown_ends_at = new Date(Date.now() - 1000).toISOString();
  let view = await advanceEmergencyRun(USER, runId);
  for (let i = 0; i < 12 && view && !["completed", "cancelled", "expired"].includes(view.status); i += 1) {
    view = await advanceEmergencyRun(USER, runId);
  }
  return view!;
}

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
  tables["profiles"] = [{ id: USER, full_name: "Allan Mawerere", phone: "+256700111222", phone_e164: null }];
  vi.clearAllMocks();
  getEmailConnection.mockResolvedValue({ email: "me@gmail.com" });
  sendGmail.mockResolvedValue({ success: true, messageId: "g1", from: "me@gmail.com", to: "x" });
  sendSystemTextEmail.mockResolvedValue({ success: true, messageId: "r1" });
  callFacility.mockResolvedValue({ status: "no_answer", messageId: "c1", detail: "No answer" });
  findEmergencyFacilities.mockResolvedValue([
    facility("Jinja Hospital", "256414123456", "info@jinja.go.ug", 800),
    facility("Care Clinic", "256772000111", null, 1500),
    facility("Email Only HC", null, "hc@care.ug", 2200),
  ]);
});

describe("startEmergencyRun", () => {
  it("uses the town the user typed when there is no GPS, and waits for the countdown", async () => {
    const view = await start();
    expect(view.status).toBe("countdown");
    expect(view.location_source).toBe("town");
    expect(view.place).toBe("Jinja");
    expect(view.countdown_ends_at).toBeNull();
    expect(view.actions.map((a) => `${a.channel}:${a.destination}`)).toEqual([
      "email:info@jinja.go.ug",
      "email:hc@care.ug",
      "call:256414123456",
      "call:256772000111",
    ]);
    expect(sendGmail).not.toHaveBeenCalled();
    expect(callFacility).not.toHaveBeenCalled();
  });

  it("prefers a Uganda GPS fix and reports it as GPS", async () => {
    const view = await start({ coords: { latitude: 0.4247, longitude: 33.2042 } });
    expect(view.location_source).toBe("gps");
    expect(findEmergencyFacilities).toHaveBeenCalledWith(0.4247, 33.2042);
  });

  it("ignores GPS outside Uganda and a (0,0) fix, and asks for a location when nothing is usable", async () => {
    const result = await startEmergencyRun({
      ...startInput,
      reportText: "I am bleeding heavily",
      placeTexts: ["I am bleeding heavily"],
      coords: { latitude: 0, longitude: 0 },
    });
    expect(result).toEqual({ ok: false, reason: "no_location" });
    expect(findEmergencyFacilities).not.toHaveBeenCalled();
  });

  it("does not start a second run within half an hour", async () => {
    await start();
    const again = await startEmergencyRun(startInput);
    expect(again).toMatchObject({ ok: true, reused: true });
  });

  it("reports no_facilities instead of a countdown when nobody can be reached", async () => {
    findEmergencyFacilities.mockResolvedValue([]);
    const view = await start();
    expect(view.status).toBe("no_facilities");
    expect(view.actions).toEqual([]);
  });
});

describe("running an emergency", () => {
  it("sends nothing before the countdown ends", async () => {
    const view = await start();
    const armed = await armEmergencyRun(USER, view.run_id);
    expect(armed?.countdown_ends_at).not.toBeNull();
    const after = await advanceEmergencyRun(USER, view.run_id);
    expect(after?.status).toBe("countdown");
    expect(sendGmail).not.toHaveBeenCalled();
    expect(callFacility).not.toHaveBeenCalled();
  });

  it("emails from Gmail as an emergency send, then calls every facility in order", async () => {
    const view = await start();
    const done = await runToEnd(view.run_id);
    expect(done.status).toBe("completed");
    expect(sendGmail).toHaveBeenCalledTimes(2);
    const [, mail, options] = sendGmail.mock.calls[0]!;
    expect(options).toEqual({ emergencyRunId: view.run_id });
    expect(mail.subject).toBe("EMERGENCY: Road / boda boda accident near Jinja – Allan Mawerere");
    expect(mail.body).toContain("+256700111222");
    expect(mail.body).not.toMatch(/\[[^\]]*\]/);
    expect(callFacility.mock.calls.map((c) => (c[0] as { to: string }).to)).toEqual(["256414123456", "256772000111"]);
    expect(done.actions.map((a) => a.status)).toEqual(["sent", "sent", "no_answer", "no_answer"]);
    expect(sendSystemTextEmail).not.toHaveBeenCalled();
  });

  it("stops calling once a facility answers", async () => {
    callFacility.mockResolvedValue({ status: "answered", messageId: "c1", detail: "Answered" });
    const view = await start();
    const done = await runToEnd(view.run_id);
    expect(callFacility).toHaveBeenCalledTimes(1);
    expect(done.actions.filter((a) => a.channel === "call").map((a) => a.status)).toEqual(["answered", "skipped"]);
  });

  it("uses Allma's system email, and says so, when Gmail is not connected", async () => {
    getEmailConnection.mockResolvedValue(null);
    const view = await start();
    expect(view.email_via).toBe("allma");
    const done = await runToEnd(view.run_id);
    expect(sendGmail).not.toHaveBeenCalled();
    expect(sendSystemTextEmail).toHaveBeenCalledTimes(2);
    expect(sendSystemTextEmail.mock.calls[0]![0]).toMatchObject({ replyTo: "me@account.test" });
    const first = done.actions.find((a) => a.channel === "email");
    expect(first?.detail).toMatch(/system email/i);
    const log = tables["email_sends"] ?? [];
    expect(log).toHaveLength(2);
    expect(log.every((row) => row.kind === "emergency" && row.emergency_run_id === view.run_id)).toBe(true);
  });

  it("falls back to the system email when Gmail fails, but not past the emergency cap", async () => {
    sendGmail.mockResolvedValueOnce({ success: false, error: "gmail_403" }).mockResolvedValueOnce({ success: false, error: "emergency_cap" });
    const view = await start();
    const done = await runToEnd(view.run_id);
    const emails = done.actions.filter((a) => a.channel === "email");
    expect(emails[0]?.status).toBe("sent");
    expect(emails[0]?.detail).toMatch(/Gmail could not send/);
    expect(emails[1]?.status).toBe("failed");
    expect(sendSystemTextEmail).toHaveBeenCalledTimes(1);
  });

  it("logs a failed call and keeps going", async () => {
    callFacility.mockResolvedValueOnce({ status: "failed", messageId: null, detail: "Call failed" });
    const view = await start();
    const done = await runToEnd(view.run_id);
    expect(done.actions.filter((a) => a.channel === "call").map((a) => a.status)).toEqual(["failed", "no_answer"]);
  });

  it("cancel stops everything that has not happened yet", async () => {
    const view = await start();
    await armEmergencyRun(USER, view.run_id);
    const cancelled = await cancelEmergencyRun(USER, view.run_id);
    expect(cancelled?.status).toBe("cancelled");
    expect(cancelled?.actions.every((a) => a.status === "cancelled")).toBe(true);
    (tables["emergency_contact_runs"]![0] as Row).countdown_ends_at = new Date(Date.now() - 1000).toISOString();
    await advanceEmergencyRun(USER, view.run_id);
    expect(sendGmail).not.toHaveBeenCalled();
    expect(callFacility).not.toHaveBeenCalled();
  });

  it("never fires long after the countdown, for example when the chat was closed", async () => {
    const view = await start();
    await armEmergencyRun(USER, view.run_id);
    (tables["emergency_contact_runs"]![0] as Row).countdown_ends_at = new Date(Date.now() - 10 * 60_000).toISOString();
    const after = await advanceEmergencyRun(USER, view.run_id);
    expect(after?.status).toBe("expired");
    expect(callFacility).not.toHaveBeenCalled();
  });

  it("only lets the owner see or drive a run", async () => {
    const view = await start();
    expect(await advanceEmergencyRun("someone-else", view.run_id)).toBeNull();
    expect(await cancelEmergencyRun("someone-else", view.run_id)).toBeNull();
  });
});
