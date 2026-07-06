# Qortium Trust

A first-pass QDN app for exploring Qortium account trust data through Qortium
Home or a local browser development node.

## Development

Install dependencies:

```sh
npm install
```

Run locally:

```sh
npm run dev -- --host 127.0.0.1
```

The browser fallback reads from `http://127.0.0.1:24891` by default. Set
`VITE_QORTIUM_NODE_API_URL` to point at another Core API during development.

Qortium Home display settings are read on launch from `theme`/`accent`/`textSize`,
`qdnTheme`/`qdnAccent`/`qdnTextSize`, or the injected `_qdnTheme`/`_qdnAccent`/
`_qdnTextSize` globals. The app also listens for the discrete Home `THEME_CHANGED`,
`ACCENT_CHANGED`, and `TEXT_SIZE_CHANGED` messages while it is running. (Home
delivers these as separate events; it does not send a combined display-settings
message.)

## QDN Publish

Build and publish the app to the local Previewnet QDN app resource:

```sh
npm run build
npm run qdn:publish
```

By default the publish helper uploads `dist/` as `qdn://APP/Trust/Trust` through
`http://127.0.0.1:24891`, using the local preview account files under
`~/git/qortium/preview`. The helper uses `QORTIUM_TRUST_NODE_API_KEY` or
`QORTIUM_TRUST_NODE_API_KEY_PATH` when set, then tries the API key for the
active local Core process, and finally falls back to `~/.config/qortium-core/runtime/apikey.txt`.
Set `QORTIUM_TRUST_QDN_NAME`, `QORTIUM_TRUST_QDN_IDENTIFIER`,
`QORTIUM_TRUST_QDN_TITLE`, or `QORTIUM_TRUST_QDN_SERVICE` to publish another QDN
resource. The expected local render URL is
`http://127.0.0.1:24891/render/APP/Trust?identifier=Trust`, and the status URL is
`/arbitrary/resource/status/APP/Trust/Trust?build=true`.

## Current Scope

The app is read-only. It uses the existing `FETCH_NODE_API` bridge action in
Qortium Home and falls back to direct local Core reads in browser development.
It currently reads:

- `/admin/status`
- `/addresses/{address}`
- `/names/address/{address}`
- `/account-ratings/trust-summary`
- `/account-ratings/trust-policy`
- `/account-ratings/trust-derivation`
- `/account-ratings`
- `/account-ratings/trust-changes`
- `/account-ratings/trust-profile`
- `/account-ratings/trust-explanation`
- `/resource-ratings`
- `/arbitrary/resource/properties/THUMBNAIL/{name}/avatar`
- `/arbitrary/THUMBNAIL/{name}/avatar?encoding=base64&rebuild=true`

## Verification

```sh
npm test
npm run build
```
