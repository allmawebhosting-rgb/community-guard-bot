const STORAGE_KEY = "allma.activeChatThreadId";

/** Remember the open AI conversation so standalone SOS can reuse it. */
export function rememberActiveChatThread(threadId: string | null | undefined) {
  if (typeof window === "undefined") return;
  if (!threadId) {
    window.sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.sessionStorage.setItem(STORAGE_KEY, threadId);
}

export function peekActiveChatThread(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(STORAGE_KEY);
  return value && value.length > 10 ? value : null;
}
