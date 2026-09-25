# ScreenCalculatorStates
The safety states of every calculator (section 28, Locks L23, L41):

1. **Incomplete** — the result area counts the missing required fields; no partial result.
2. **Invalid** (hard range: physiologically impossible) — field error with the expected value; result blocked.
3. **Outside the validated range** — "Calcul non disponible" with the reason; **no number is shown**, even if the formula could compute one. The range always comes from the calculator's source.
4. **Plausibility** — an unusual but possible value gets a neutral "Vérifiez la valeur" note that does not block; **unit conversion** is always displayed ("Converti : 1,2 mg/dL = 106 µmol/L"), never silent.
5. **Source sheet** — citation, formula, units and conversion factor, version and publication date, reviewer and date, number of reference tests passed, limitations.
6. **Offline** — computed on the device with the exact installed published version, which passed its test cases on the device before use.
