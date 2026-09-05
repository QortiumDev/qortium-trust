# Changelog

## Unreleased

- Fix numeric account sorting so the first descending page contains the highest values when the directory spans multiple pages.

- Reshape the existing account list and detail views with compact spacing, combined
  role groups, distinct status shields and policy-based status help. Preserve blocks
  minted, detailed evidence, rating choices, pending handling and Home display settings.
- Default to latest outgoing rating submission using existing confirmed history reads;
  expose mobile sorting and explicit fallback when complete available reads fail.
- Open the existing selected-role rating form directly from account rows.
- Refresh cooldown countdowns and impact previews without overwriting draft opinions;
  recover initial read failures without inadvertently selecting rating removal.
- Sort personal ratings from the same role-keyed current/pending data shown in the list.
- Keep help collapsed by default and cover new copy in all 23 supported locale catalogs.
