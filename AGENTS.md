<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- CallCenter publishes microphone ownership synchronously through the call-audio store; voice work checks its revision to discard replies from before a call.
- Push endpoint reassignment uses an atomic privileged upsert only inside the authenticated save handler; owner-scoped RLS remains unchanged for ordinary access.
- Responder navigation aborts route requests only when superseded or unmounted, not on ordinary renders; this preserves pending directions through call timer ticks and small GPS updates.
- Managed Google sign-in uses the Lovable OAuth helper with a public same-origin callback; navigation waits for a session so invitations survive sign-in.
- Chat and voice share cause-aware gateway error classification and disable automatic SDK retries; credit/access failures preserve their status and safe remedy without provider fallback.
