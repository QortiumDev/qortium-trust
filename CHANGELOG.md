# Changelog

## Unreleased

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
