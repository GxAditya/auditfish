<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules

- BYOK: the user's TinyFish key lives in browser localStorage and is passed per request (server fn arg or `X-TinyFish-Key` header); never persist it server-side — app has no accounts or database.
- All TinyFish calls go through `src/lib/tinyfish.server.ts`; the verification pipeline there is shared by the streaming UI route and the public JSON API so both return identical `auditfish.v1` results.
- Pure matching/status/official-domain logic lives in `src/lib/verification.ts` with tests; matching must never auto-pick among several candidates.
- Watch state = TinyFish Monitors (source of truth) plus local snapshots for before/after; monitors created by the app are named with the "AuditFish" prefix.
