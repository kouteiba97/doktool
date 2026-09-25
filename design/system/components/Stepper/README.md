# Stepper
Progress through a short, ordered flow (verification, pediatric dosing, onboarding). Steps can be revisited; progress is saved at every step.

## Anatomy
Numbered 20px discs (done = `teal` with check, current = `brand` ring, error = `critical` "!", todo = `border-strong`) joined by hairlines, labels in `caption` (current in `ink` 600). Compact variant: "Étape n sur N · label" + 4px progress bar + "Plus tard".

## Variants
`horizontal` (desktop, ≤ 5 steps) · `compact` (mobile) · `summary` (inside a result: echoes chosen inputs, each clickable).

## Sizes
Disc 20px; compact bar 4px.

## States
todo · current · done · error (needs correction, reason on the step screen) · skipped (optional steps, shown as done-with-dash).

## Interaction
Done steps are links back; future steps are not. Leaving mid-flow keeps a draft and a "Reprendre" entry on Home/Profile.

## Accessibility
`nav` + `ol`; current step `aria-current=step`; each disc has a text label ("Étape 2, terminée").

## Responsive
Mobile uses compact; desktop horizontal; pediatric desktop renders all steps as sections of one form with the stepper as a summary.


## Tokens
`teal`, `on-teal`, `brand`, `critical`, `border-strong`, `border`, `ink-muted`.

## Consumer provides
`steps[{id, label, state}]`, `current`, `onStep`.

## Do not
More than 5 steps (split the flow). Colour-only step states.
