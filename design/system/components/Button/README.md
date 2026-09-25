# Button
The single action control of DokTool; one `primary` per screen region, everything else `secondary` or `ghost`.

**Variants** `primary` (brand fill, on-brand text), `secondary` (surface + border-strong), `ghost` (brand text, brand-soft on hover), `danger` (critical outline; destructive only), `teal` (the compute action in calculators and pediatric dosing). **Sizes** `sm` 32px, default 40px, `lg` 48px (mobile primary and onboarding). `icon` makes a square button and requires `aria-label`.

**States** hover (brand-hover / surface-raised), focus-visible (2px `focus` ring, 2px offset), active (same as hover, no scale), disabled (`opacity-disabled`, no pointer), loading (spinner replaces the leading icon; label states the action in progress: "Export en cours…").

**Consumer provides** label (infinitive verb, sentence case), optional 20px Lucide icon, `onClick`, `loading`, `disabled`. Do: keep labels under three words. Don't: two primaries side by side; icon-only without a label; a primary for "Annuler".
