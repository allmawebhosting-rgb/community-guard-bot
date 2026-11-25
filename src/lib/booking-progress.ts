/** Turn robotic browser-agent step labels into live first-person status lines. */

const END = String.raw`[\s.…]*$`;

const REPLACEMENTS: Array<[RegExp, string]> = [
  [new RegExp(`^starting browser booking agent${END}`, "i"), "Starting the booking agent now…"],
  [new RegExp(`^starting booking agent${END}`, "i"), "Starting the booking agent now…"],
  [new RegExp(`^booking job started${END}`, "i"), "Booking job started — I'm on it…"],
  [new RegExp(`^understanding booking request${END}`, "i"), "Reading your appointment request…"],
  [new RegExp(`^looking up clinic contact details${END}`, "i"), "Looking up the clinic's contact details…"],
  [/^matched clinic:\s*(.+)$/i, "Matched clinic: $1"],
  [new RegExp(`^clinic directory lookup finished${END}`, "i"), "Finished the clinic directory lookup…"],
  [/^found clinic website/i, "Found the clinic website — opening it now…"],
  [/^found clinic phone/i, "Found the clinic phone — checking online booking…"],
  [/^opening clinic website/i, "Opening the clinic website now…"],
  [/^open the official clinic page/i, "Opening the official clinic page…"],
  [/^opening clinic pages/i, "Opening the clinic booking pages…"],
  [/find and click on appointment or booking/i, "Looking for the appointment / booking button…"],
  [/find the appointment booking form/i, "Looking for the booking form on this page…"],
  [/logging in|sign\s*in|log in/i, "Logging in to the clinic portal now…"],
  [/filling (the )?appointment form/i, "Filling in the appointment form…"],
  [/capturing confirmation/i, "Capturing the booking confirmation…"],
  [/online booking unavailable/i, "Online booking isn't available — gathering clinic contacts…"],
  [/preparing phone-booking fallback/i, "No online form — preparing the phone booking contacts…"],
  [/report the contact information/i, "Collecting the clinic phone and email for you…"],
  [/find an alternative way to book/i, "Checking another way to book this appointment…"],
  [/booking in progress/i, "Still working on your appointment…"],
];

export function humanizeBookingStep(label: string): string {
  const raw = String(label || "").trim();
  if (!raw) return "Working on your booking…";
  for (const [pattern, replacement] of REPLACEMENTS) {
    if (pattern.test(raw)) {
      return raw.replace(pattern, replacement);
    }
  }
  // Soft first-person if it already reads like a status.
  if (/^(i('| a)m|opening|looking|checking|filling|calling|emailing)\b/i.test(raw)) {
    return raw.endsWith("…") || raw.endsWith(".") ? raw : `${raw}…`;
  }
  return raw;
}

export function humanizeBookingSteps<T extends { label: string }>(steps: T[]): T[] {
  return steps.map((step) => ({ ...step, label: humanizeBookingStep(step.label) }));
}

export const BOOKING_START_STEPS = [
  { label: "Reading your appointment request…", status: "completed" },
  { label: "Looking up the clinic now…", status: "running" },
] as const;
