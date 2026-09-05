# Changelog

## Unreleased

- Skip redundant Home unlock approval when the selected account is already unlocked.
- Close the feed rating editor on Submit and show progress immediately on its role
  card, allowing navigation and further ratings while Home approves/broadcasts.
- Preserve submission failures across navigation, guard duplicate submissions, and
  reconcile unknown broadcast outcomes without automatically resubmitting.
- Add a header info link to the community Trust wiki article.

## 1.4.7 — 2026-09-05

- Show the signed numeric value beside rating degrees in summaries and rating choices,
  for example Very high (4) or Low (-1).

## 1.4.6 — 2026-09-05

- Refresh the build and test dependencies: Vite 8.2.2, Vitest 4.1.11, React plugin
  6.1.1, React types 19.2.18, React DOM types 19.2.5, and Undici 7.29.1.

## 1.4.5 — 2026-09-05

- Shorten rating summaries to answer and degree (for example, “Yes · Very high”),
  omitting the repeated confidence label across locales.

- Compact account pages with identifiers beside the name when they fit, wrapping
  role metrics, and tighter rating/evidence spacing while retaining full copyable values.

- Compact Minters-only cards into one row where space allows, with inline timestamps
  and label/value pairs that wrap by container width and text size.

- Open a role-specific rating dialog from any feed role panel; keep username headers
  linked to account details. Reuse the existing rating editor and parent pending state.
- Keep rating controls visible on account detail for the selected role; show disabled
  controls with the existing reason when Home, identity or self-rating rules prevent rating.
- Preserve pending confidence when reopening an editor; support keyboard dialog entry,
  focus return and dismissal after broadcast while retaining cooldown and retry handling.

- Separate account cards with contrasting identity header bands and clearer top borders;
  tighten combined-role spacing and keep header metadata on one row where space allows.

- Show each role's derived status badge in combined lists and account detail cards,
  including Unverified; keep missing role data distinct from a known Unverified status.

- Explain the current standing before separately collapsed higher-level requirements;
  clarify that Minter levels 3 and 4 both remain Gold. Show Suspicious conditions neutrally.
- Return through linked accounts with the detail Back button, preserving browser Forward
  and keeping direct-link Back inside the app.
- Omit redundant addresses beside account names in lists and evidence; retain the
  full address with its copy control on account detail and the unnamed-account fallback.

- Use red for Voters, green for Guides and purple for Designers across role icons,
  headings and panel accents in dark and light themes; keep Minters gold.

- Fix numeric account sorting so the first descending page contains the highest values when the directory spans multiple pages.

- Reshape the existing account list and detail views with compact spacing, combined
  role groups, distinct status shields and policy-based status help. Preserve blocks
  minted, detailed evidence, rating choices, pending handling and Home display settings.
- Default to latest outgoing rating submission using existing confirmed history reads;
  expose mobile sorting and explicit fallback when complete available reads fail.
- Open details from account cards/names without repeated detail buttons. Keep the
  direct Minters Rate action when available.
- Refresh cooldown countdowns and impact previews without overwriting draft opinions;
  recover initial read failures without inadvertently selecting rating removal.
- Sort personal ratings from the same role-keyed current/pending data shown in the list.
- Keep help collapsed by default and cover new copy in all 23 supported locale catalogs.
- Keep Show all roles beside navigation so it can be changed within account details.
- Default to dark mode when no explicit Home/query theme is provided.
- Break latest-submission ties by descending Minter status, then account name.
- Restrict the account directory to current minting-group members before pagination;
  keep Suspicious members and never restore non-members from historical activity.
- Calculate directory summary counts from the displayed membership scope.
- Collapse Why this standing by default, with its existing requirements available on click.
- Restore avatars in read-only browser previews with pointer-first Core reads and
  primary-name legacy fallback; keep Home bridge gating, bounded image validation
  and pending retries. Accept valid default-resource pointers with empty identifiers.
- Order combined account roles and received-rating groups Minters, Voters, Guides, Designers.
- Add reference-inspired Classic navy panels, illuminated edges and angular corners;
  default previews to cyan while respecting explicit Home accents and themes.
- Refine SVG role medallions with distinct role colors and metallic status shields,
  retaining non-color status shapes. Improve avatar framing, focus and account text
  containment at large text sizes and in right-to-left layouts.
