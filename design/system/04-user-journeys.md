# 04 · User journeys — V1

Each journey lists the screens in order (names match section 08) and the moment that must feel fast. Mobile unless marked Admin. The pre-V1 journeys for drug search, pediatric dosing, pregnancy checks, prescription creation/editing/export, certificate creation, custom templates, drug editing, clinical content review and partnerships are future roadmap (section 25).

| # | Journey | Path | The moment that matters |
|---|---|---|---|
| 1 | Prospective doctor tries the Demo | Welcome → Explorer la démo → Médecin / Résident → Demo Home (demo bar) → Search "angine" → opens a sample ordonnance → opens a sample calculator → taps a non-sample model → locked sheet "Inclus dans DokTool Pro" → Voir les offres → Plans (includes · not included · price · duration) | Inside the real product in one tap, no sign-up; the boundary between sample and paid is explicit and honest |
| 2 | Demo → subscription | Plans → Créer un compte → OTP → Qui êtes-vous ? → Vérification professionnelle → En revue → Vérifié → Plans → Récapitulatif & confirmation (non-refundable acknowledgement) → SATIM → Confirmation (Active, period, transaction ID) | The user knows exactly what they pay for before paying |
| 3 | New medical student | Welcome → Créer un compte → Étudiant en médecine → Université · année → Carte d'étudiant → En attente → Home (student) → push "Vérifié" | Student tools available while pending (bounded window); professional items visible and locked, calmly explained |
| 4 | New doctor | Welcome → Créer un compte → Médecin → Identité → Statut professionnel (n° d'ordre) → Spécialité → Récapitulatif → En attente → Home (sample content, verification banner) → Vérifié → Plans → Pay → Full access | Verification never feels like a wall; paying is only offered once verification succeeded |
| 5 | Resident verification | as 4 with Résidanat (attestation + année) → Établissement (picker) | Institution is picked, never typed |
| 6 | Finding a reference ordonnance | Any screen → Recherche → "angine" → group Ordonnances → row → Reference viewer (notice pinned) → read → back | Search to PDF in ≤ 2 taps; PDF shown as uploaded, whatever the UI language |
| 7 | Finding a certificate model | Bibliothèque → Certificats → search "arrêt" → row → viewer | Same pattern as ordonnances — one library architecture |
| 8 | Using a calculator | Recherche or Bibliothèque → Calculateurs → calculator → typed inputs with units → result appears when every required input is valid → interpretation → formula + source → Copier | No result from incomplete or out-of-range inputs; result is the largest element on screen |
| 9 | Calculator input outside validated range | Enter a value outside the source's validated range → field note + result area "Calcul non disponible — {reason}" → correct value → result | Never a number that the source does not support |
| 10 | Saving a favorite | ★ on a row or viewer → toast "Ajouté aux favoris" (undo) → Profil › Favoris / Home strip | One tap |
| 11 | Reusing recent activity | Home › Récents or Profil › Activité → tap → destination (calculator restores last inputs from the device, labelled "Valeurs précédentes") | Last inputs never leave the device |
| 12 | Student meets a professional item | Library → Certificats → row with lock → sheet "Réservé aux médecins et résidents abonnés" (no upsell) → back | Clear, calm, informative |
| 13 | Renewal | 14 days before end: neutral line on Subscription + one notification → Renouveler → Récapitulatif → pay → new period | No countdown, no red |
| 14 | Ended subscription | Period end → 7-day grace (access kept, neutral notice) → Ended → sample content only, favorites/history kept → Renouveler restores instantly | Nothing is deleted |
| 15 | Offline use | Airplane mode → neutral OfflineBar with data date/version → search downloaded models → open cached PDF ("Cache · date") → calculator runs its installed published version → reconnect → "Synchronisé" | Every cached item shows its version and date |
| 16 | Changing language or theme | Profil → Paramètres → Langue: English / Apparence: Sombre → applied instantly, no reload | PDF content unchanged by language |
| 17 | Admin uploads a reference model (Admin) | Bibliothèque de référence → Ordonnances → Ajouter → drop PDF → title pre-filled from file name → optional English title → access tier · demo sample → Enregistrer → processing → Activé | Under a minute; no clinical form to fill |
| 18 | Admin replaces a PDF (Admin) | Row → drawer → Remplacer le PDF → drop → reason → confirm → version +1 (same id, favorites kept) → audit entry | History of every file kept |
| 19 | Admin publishes a calculator version (Admin) | Calculateurs → calculator → Nouvelle version (draft) → definition + source + test cases → Lancer les tests → all pass → Soumettre → reviewer (≠ author) reviews → Publier | Cannot publish without source, passing tests and a different reviewer |
| 20 | Admin reviews a doctor (Admin) | Vérification → queue (SLA sort) → drawer: identity (restricted viewer, if granted) · status · specialty → Approuver / Rejeter (reason) / Demander un complément → audit entry | Reviewer sees only what their grants allow |
| 21 | Admin reviews revenue (Admin) | Finance → period → Revenu brut → Frais → Revenu net (+ separate Rentabilité block) → chart by plan → Transactions (filtered) → transaction drawer | Revenue → transaction in three clicks; revenue never confused with profit |

## Search → action model (V1)

A reference row exposes **Voir le modèle / View model** (primary, tap) and **★**; a calculator row exposes **Ouvrir / Open** and **★**; a locked row opens the locked sheet with its reason. Long-press or the trailing `⋯` opens the row actions as a bottom sheet.
