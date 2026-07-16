# Qortium Trust

A QDN explorer for Qortium account trust data. It runs inside Qortium Home
through the `qdnRequest` bridge and has a read-only plain-browser fallback for a
local Core node.

## Current features

- Graph, accounts-table, and recent-changes views.
- Trust categories for Minters, Voters, Guides, and Designers.
- Search by address or resolved registered name, sortable account columns, and
  avatar/name identity resolution.
- Graph node focus, account selection, and fullscreen graph mode.
- Account drill-down with status, level, score, trust weight, rating counts,
  and the strongest positive and negative impacts.
- Deep links using `?account=<address>` or `?target=<address>`.
- Home-mediated rating submission and removal when `RATE_ACCOUNT` is advertised,
  including unlock prompts, cooldown checks, previewed impact, and confirmation
  polling.

The explorer currently requests live trust derivations (`live=true`) for its
category data. There is no live/snapshot toggle in the current UI.

In Qortium Home, selected-account identity and writes stay behind the bridge.
The app feature-detects `RATE_ACCOUNT`; when it is absent, the same views remain
available but rating controls are disabled. In a plain browser, reads fall back
to `http://127.0.0.1:24891` and all rating behavior is read-only. Set
`VITE_QORTIUM_NODE_API_URL` to use another development node.

## QAVS and UI styles

Trust is at QAVS `1.4.0`: `1.4` is its minimum Qortium platform level and the
patch number tracks the app release. `vite.config.ts` reads `package.json`,
injects the visible version in the header, and emits `dist/qortium-app.json`
with the name `Trust` during every build.

The app supports Classic and Modern QDN UI styles and follows Home theme,
accent, language, and text-size settings. It does not define a Fun style.

## Development and verification

```sh
npm install
npm run dev -- --host 127.0.0.1
npm test
npm run build
npm run preview
```

## Previewnet publish

```sh
npm run build
npm run qdn:publish
```

The publish helper uploads `dist/` as `qdn://APP/Trust/Trust` through the local
Core at `http://127.0.0.1:24891`. It defaults to the account file at
`~/qortium/git/qortium-core/preview/secrets/initial-minting-accounts.json`.
Environment overrides for the node, API key, account file, QDN identity, title,
service, and dist path use the `QORTIUM_TRUST_` prefix.

The current render URL is
`http://127.0.0.1:24891/render/APP/Trust/Trust`. The status endpoint is
`/arbitrary/resource/status/APP/Trust/Trust?build=true`; the publisher waits for
it to report `READY`.
