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
