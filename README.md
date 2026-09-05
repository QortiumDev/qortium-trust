# Qortium Trust

Trust is an account-centered QDN app for understanding and participating in
Qortium’s community trust system. It runs inside Qortium Home through the
`qdnRequest` bridge and has a read-only browser fallback for a local Core node.

## Current experience

- Accounts opens with Minters and sorts by each person's latest confirmed outgoing
  rating submission, across all roles. Ties use Minter status (Gold first), then
  account name. Repeated raters appear once; removals count.
- Only current minting-group members appear in the account directory, regardless
  of their trust status or blocks minted. The directory summary uses those same accounts.
- Show all roles expands each account into one combined group containing Minters,
  Voters, Guides and Designers. The role selector controls role-specific sorting.
- Account rows retain trust status, blocks minted, standing and personal ratings;
  the combined view also shows every role's score and received rating counts.
- Click a username header to open account details. Each combined role panel opens
  a rating dialog for that account and role; the Minters view has a direct Rate action.
  Show all roles stays beside the
  navigation tabs, including while viewing account details.
- Status shields differ by shape as well as color; expandable help explains voting
  weight and minting consequences using the current policy.
- Combined role views show each role's own derived status badge, including Unverified.
  The account header retains the overall Minter standing.
- Contrasting account header bands separate people in the combined view; compact role
  panels and responsive header metadata reduce scrolling without hiding account data.
- Minters-only cards keep names and timestamps together and labels beside their values,
  fitting one row where possible and wrapping groups for narrower views or larger text.
- Account detail presents the avatar and name together with copy controls for
  the name, address, and public key. Lists show names without redundant addresses;
  unnamed accounts retain their address as the identity fallback.
- Account-page identifiers sit beside the name where space allows and wrap below
  on phones; role metrics and the selected-role summary also wrap compactly.
- One role can be rated at a time from account detail, while all four role
  standings remain visible for comparison. Selecting a role changes the rating editor.
  The feed dialog uses the same editor, cooldown, unlock and pending-confirmation flow.
  Browser previews show disabled rating controls; submission requires Qortium Home.
- Why this standing starts collapsed and explains the current level's requirements.
  Higher-level requirements have a separate disclosure; Gold remains the highest
  Minter status even when its internal trust level increases. Detailed explanations show capped level score,
  strongest impacts, and the active ratings received from identifiable raters.
- The role guide explains the community flow:
  Designers shape the system, Guides share understanding, Voters apply the
  system, and Minters receive the final trust standing.
- Recent Changes is unified across roles, and account names link back to account
  detail wherever the account is present in the loaded directory.
- Deep links use `?account=<address>` or the legacy `?target=<address>`. Account
  and section changes create browser-history entries while retaining Home's
  display and bridge query parameters, so Home Back and Forward can traverse
  the in-app route history. The detail Back button follows that same history;
  a directly opened account returns to the list without leaving the app.
- Home-mediated rating submission checks the live lock state and requests unlock
  only when needed, while retaining Home's rating approval. Submitting closes the
  feed editor immediately and shows a per-role spinner through approval/broadcast
  and block confirmation. Browsing and other ratings remain available; duplicate
  submissions for the same account/role are blocked. Errors remain visible after
  navigation, with a link back to the affected account and role.
- Cooldown checks, impact preview, confirmation polling and Retry/Dismiss remain
  available. The open editor refreshes its remaining-block countdown and preserves
  draft selections. Unknown broadcast outcomes are reconciled through reads, never
  automatically resubmitted.
- Trust retains the initially selected rating identity. If Home's live account has
  changed, submission stops; reload Trust to adopt that account and review the draft.
- The header info button opens the community wiki's Trust article in a new tab.

The app requests live trust derivations (`live=true`). In Qortium Home, identity
and writes stay behind the bridge. When `RATE_ACCOUNT` is unavailable, the
complete explorer remains available in read-only mode.

## Recent activity reads

This increment uses existing Core APIs; no backend or signing changes are required.
It reads confirmed RATE_ACCOUNT history up to a pinned block height, verifies the
block signature before and after, and orders people by transaction submission time.
Only approved or approval-exempt transactions count. Current minting-group membership is filtered by Core before pagination. Historical
activity does not add non-members back to the directory.

History reads grow through 1,000 / 4,000 / 8,000 transaction prefixes; the directory
is capped at 5,000 entries. A full final
prefix, incomplete directory, unsupported endpoint or failed read causes an explicit
fallback to loaded accounts by name. Refresh or selecting recent activity retries.
A short response establishes exhaustion of the node's available history; it cannot
certify archival completeness on an arbitrary node. Larger networks may eventually
need a paginated Core activity query.

## QAVS and UI styles

Trust is at QAVS `1.4.8`: `1.4` is its minimum Qortium platform level and the
patch number tracks the app release. `vite.config.ts` reads `package.json`,
injects the visible version, and emits `dist/qortium-app.json` on every build.

Classic and Fun use the available app window with responsive local constraints.
Modern retains its intentionally wider outer margins. Browser previews default to dark mode with a cyan accent. Classic uses navy
  gradient panels, restrained illuminated edges and angular corner details. Role medallions use gold for Minters, red for Voters, green for Guides and purple
for Designers; status shields keep their distinct silhouettes with metallic shading.
All three styles consume
Home’s explicit theme, accent, language, and text-size settings, including RTL and
reduced-motion behavior. Typography switches live as well: Classic uses
Lexend, Modern uses Inter, Fun uses Comic Neue with Fredoka display text, and
technical values remain monospace.

## Development and verification

```sh
npm install
npm run dev -- --host 127.0.0.1
npm test
npm run build
npm run preview
```

Browser avatars use Core’s current account-avatar pointer, falling back to the
primary name’s legacy thumbnail only when no pointer is set. Image reads are
bounded to 500 KiB, validate raster signatures, and share a four-request queue.
Home continues to provide avatars through its existing bridge action.

The browser fallback reads from `http://127.0.0.1:24891`. Set
`VITE_QORTIUM_NODE_API_URL` to use another development node.

## Previewnet publish

```sh
npm run build
npm run qdn:publish
```

The publish helper uploads `dist/` as `qdn://APP/Trust/Trust` through the local
Core. It rejects stale builds, validates the transaction-processing response,
and refuses to send a private key to any non-loopback node unless explicitly
overridden. Environment overrides use the `QORTIUM_TRUST_` prefix.

After publication, verify:

- `/arbitrary/resource/status/APP/Trust/Trust?build=true` reports `READY`
- `/render/APP/Trust/Trust` renders successfully
- `/arbitrary/APP/Trust/Trust?filepath=qortium-app.json` reports version `1.4.8`
