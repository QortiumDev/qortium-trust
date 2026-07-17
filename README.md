# Qortium Trust

Trust is an account-centered QDN app for understanding and participating in
Qortium’s community trust system. It runs inside Qortium Home through the
`qdnRequest` bridge and has a read-only browser fallback for a local Core node.

## Current experience

- Accounts is the default view and shows Designers, Guides, Voters, and Minters
  together instead of splitting them across four nearly identical pages.
- Every account row includes its displayed trust, blocks minted, role standing,
  role score, ratings received, and the current user’s rating.
- Account detail presents the avatar and name together with copy controls for
  the name, address, and public key.
- One role can be rated at a time from account detail, while all four role
  standings remain visible for comparison.
- Detailed trust explanations show capped level score, unmet requirements,
  strongest impacts, and the active ratings received from identifiable raters.
- The role guide explains the community flow:
  Designers shape the system, Guides share understanding, Voters apply the
  system, and Minters receive the final trust standing.
- Network is a secondary, account-centered view backed by Core’s
  `/account-ratings/trust-graph` endpoint. It supports direct or two-step
  neighborhoods, incoming/outgoing filtering, positive/negative filtering,
  pan, zoom, fullscreen, and keyboard-readable relationships.
- Recent Changes is unified across roles, and account names link back to account
  detail wherever the account is present in the loaded directory.
- Deep links use `?account=<address>` or the legacy `?target=<address>`.
- Home-mediated rating submission includes unlock prompts, cooldown checks,
  impact preview, optimistic pending state, and confirmation polling.
- Home selected-account changes refresh the rater identity, available bridge
  actions, current ratings, and pending editor state.

The app requests live trust derivations (`live=true`). In Qortium Home, identity
and writes stay behind the bridge. When `RATE_ACCOUNT` is unavailable, the
complete explorer remains available in read-only mode.

## QAVS and UI styles

Trust is at QAVS `1.4.2`: `1.4` is its minimum Qortium platform level and the
patch number tracks the app release. `vite.config.ts` reads `package.json`,
injects the visible version, and emits `dist/qortium-app.json` on every build.

Classic and Fun use the available app window with responsive local constraints.
Modern retains its intentionally wider outer margins. All three styles consume
Home’s theme, accent, language, and text-size settings, including RTL and
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
- `/arbitrary/APP/Trust/Trust/qortium-app.json` reports version `1.4.2`
