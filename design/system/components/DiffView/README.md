# DiffView
Field-level comparison of two versions — calculator definitions in the review step, and before/after values in the audit log.

## Anatomy
Three columns: field, before, after. `del` (strike + `critical-soft`), `ins` (`success-soft`); whole-row tags "+ AJOUTÉ" / "− SUPPRIMÉ". Header: status, item, version transition in mono, mode switch.

## Variants
`side-by-side` · `unified` (drawers) · `structured` (numeric ranges with units and delta).

## Sizes
—

## States
loading · no changes · large (collapse unchanged).

## Interaction
`n`/`p` jump between changes.

## Accessibility
Changes carried by text tags, not colour.

## Platforms (v2.2)
Admin Web only.

## Tokens
`critical-soft`, `success-soft`, `surface-sunken`, `border`, `radius-md`.

## Consumer provides
`fields[{key, label, before, after, kind}]`, `fromVersion`, `toVersion`.

## Don't
Rendered HTML diffs; a diff without versions and author.
