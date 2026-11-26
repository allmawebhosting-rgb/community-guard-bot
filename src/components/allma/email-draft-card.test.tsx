import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: () => unknown) => fn,
}));
vi.mock("@/lib/email-connection.functions", () => ({
  getEmailConnectionStatus: async () => ({ configured: true, connected: true, email: "me@gmail.com" }),
  sendEmailFromMyAccount: vi.fn(),
}));
vi.mock("@/lib/gmail-client", () => ({
  beginGmailConnect: vi.fn(),
  sendErrorMessage: () => "error",
}));

import { EmailDraftCard } from "./email-draft-card";

function renderCard(draft: Parameters<typeof EmailDraftCard>[0]["draft"]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EmailDraftCard draft={draft} />
    </QueryClientProvider>,
  );
}

describe("EmailDraftCard placeholders", () => {
  it("highlights leftovers, warns, and keeps Send disabled until they are gone", async () => {
    const { container } = renderCard({
      to: "clinic@example.org",
      subject: "Request for [Patient Name]",
      body: "Hello,\n\nPlease call [Callback Number].",
    });
    const send = await screen.findByRole("button", { name: /send from my gmail/i });
    expect(screen.getByText("Fill in the highlighted parts before sending.")).toBeTruthy();
    expect(container.querySelectorAll("mark")).toHaveLength(2);
    expect((send as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Request for Allan" } });
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "Hello,\n\nPlease call +256700111222." } });
    expect(screen.queryByText("Fill in the highlighted parts before sending.")).toBeNull();
    expect(container.querySelectorAll("mark")).toHaveLength(0);
    expect((send as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps the To field empty with the no-guessing note", async () => {
    renderCard({ to: null, subject: "Hello", body: "A complete message with no gaps." });
    await screen.findByRole("button", { name: /send from my gmail/i });
    expect(screen.getByText(/Allma does not guess email addresses/)).toBeTruthy();
  });
});
