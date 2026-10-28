import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  oauth: vi.fn(), directOAuth: vi.fn(), navigate: vi.fn(), toast: vi.fn(),
  getSession: vi.fn(), getUser: vi.fn(), resolvePath: vi.fn(),
  next: "/safety-network",
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: () => unknown }) => ({
    ...options, useSearch: () => ({ next: mocks.next }),
  }),
  useNavigate: () => mocks.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/integrations/lovable", () => ({ lovable: { auth: { signInWithOAuth: mocks.oauth } } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: mocks.getSession, getUser: mocks.getUser, signInWithOAuth: mocks.directOAuth } },
}));
vi.mock("@/lib/onboarding", () => ({ resolvePostAuthPath: mocks.resolvePath }));
vi.mock("@/lib/phone-auth.functions", () => ({ signUpWithPhone: vi.fn() }));
vi.mock("@/components/allma/brand", () => ({ BrandLockup: () => null }));
vi.mock("@/components/allma/mascot", () => ({ Mascot: () => null }));
vi.mock("sonner", () => ({ toast: { error: mocks.toast } }));
import { Route } from "./auth";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "member" } } });
  mocks.resolvePath.mockResolvedValue("/onboarding");
});
afterEach(cleanup);
const AuthPage = Route.component as React.ComponentType;

it("uses managed Google with a public callback and preserves the invitation destination", async () => {
  mocks.oauth.mockResolvedValue({ redirected: true });
  render(<AuthPage />);
  fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
  await waitFor(() => expect(mocks.oauth).toHaveBeenCalledWith("google", {
    redirect_uri: `${window.location.origin}/auth?next=%2Fsafety-network`,
  }));
  expect(mocks.directOAuth).not.toHaveBeenCalled();
  expect(mocks.navigate).not.toHaveBeenCalled();
});

it("keeps a failed Google request in the app rather than navigating", async () => {
  mocks.oauth.mockResolvedValue({ error: new Error("Google sign-in could not start.") });
  render(<AuthPage />);
  fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(mocks.getUser).not.toHaveBeenCalled();
});

it("resolves post-sign-in navigation only after the helper establishes a session", async () => {
  mocks.oauth.mockResolvedValue({ redirected: false });
  render(<AuthPage />);
  fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
  await waitFor(() => expect(mocks.resolvePath).toHaveBeenCalledWith("member", "/safety-network"));
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/onboarding", replace: true });
});