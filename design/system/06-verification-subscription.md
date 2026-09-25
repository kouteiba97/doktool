# 06 · Verification, subscription and privacy — V1

## Onboarding and verification (mobile)

```
Welcome → Créer un compte → Qui êtes-vous ? → Détails → Vérification (n steps) → Statut → Accès
          (or: Explorer la démo — section 27)
```

- **Qui êtes-vous ? / Who are you?** — three large selectable rows (not cards): Médecin · Médecin résident · Étudiant en médecine; each with one line saying what DokTool gives them and whether it is free. Selecting sets `professionalType` only. Pharmacist and other health professionals are future roadmap.
- **Créer un compte** — e-mail or phone, password, first and last name, wilaya; OTP confirmation. The account exists before verification starts.
- **Verification intro** — one screen: *Pourquoi* (DokTool is reserved to health professionals and students), *Ce que nous vérifions* (per type), *Vos documents* (private storage, restricted access, kept N months, deletable), *Durée* (usually < 24 h). One primary action; "Plus tard" always available.
- **Steps** (one screen each, `Stepper`, resumable). Identity and professional/student status are **separate verification cases**, decided independently.

| Type | Case 1 — Identity | Case 2 — Status |
|---|---|---|
| Médecin | CNI or passport (camera-first, OCR pre-fill) | N° d'inscription à l'Ordre + attestation or diploma → Spécialité (picker) |
| Résident | CNI or passport | Attestation de résidanat + année → Établissement (picker) → Spécialité en cours |
| Étudiant | CNI, passport or student card | Université (picker) + année (1–7) → Carte d'étudiant / certificat de scolarité |

- **Récapitulatif** shows step checkmarks and file names only, then *Envoyer*.
- **Statut** is a vertical timeline (Reçu → En cours de revue → Décision) with the usual delay; the `VerificationStatus` component summarises it and is reused in Profile and the avatar dot (grey pending · teal verified · warning expiring · critical rejected — the only place `critical` appears in account UI).
- **Rejected**: reason in plain language, which step to redo, *Corriger et renvoyer*; appeal after a second rejection, routed to a different reviewer.
- **Expiring**: reminders 60 and 14 days before; re-verification reuses unchanged identity. Professional verification expiring during an active subscription does not interrupt access before the period end; renewal requires re-verification.
- **Role transition** (student → resident → doctor) is a re-verification on the same account; favorites, activity and preferences persist.

## Subscription (mobile)

**Plans (V1):** *Accès étudiant* — free, requires student verification, no subscription row · *DokTool Pro* for doctors and residents (monthly and annual; prices in DZD with taxes). Professional, Institutional and automatic renewal are future roadmap.

**Model: no refunds, Demo first.** The Demo lets a prospective professional use the real product before paying (section 27), so the purchase is informed. The product has no "request refund" workflow anywhere.

- **Plans screen** — for each plan: what it includes, what it does not include (plainly: no drug database, no prescription or certificate generation), duration, price, access level. Calm layout, no countdown, no fake scarcity, no "most popular" ribbon.
- **Checkout gate** — "S'abonner" is enabled once professional verification is `VERIFIED`; before that the button reads "Vérification requise" and links to the status.
- **Récapitulatif & confirmation** — plan, price, duration, period start/end, payment method, access level, then one acknowledgement line: *« J'ai compris ce que comprend DokTool Pro. Le paiement n'est pas remboursable. »* / *"I understand what DokTool Pro includes. The payment is non-refundable."* → Payer.
- **Payment** — CIB / Edahabia via SATIM redirect; bank transfer with manual confirmation (pending state). Failure names the provider's message and offers retry or another method.
- **Subscription screen** — plan, status as a neutral badge (Actif · Renouvellement le 12 oct. · Période de grâce · Terminé), period start and end, access level, payment method, renewal information, transaction history (date · montant · moyen · n° de transaction · reçu). No red, no countdown, no promotional blocks.
- **Renewal** — manual in V1: a neutral line from 14 days before the end, one notification at 14 days and one at 3 days, "Renouveler". After the end, 7 days of grace with access kept and a neutral notice; then "Terminé" — the account keeps favorites, activity and settings and returns to sample content until renewal.
- **Cancel** — "Ne pas renouveler" simply records the choice; access continues to the period end.

## Privacy by design

- DokTool collects **no patient data**: no patient fields anywhere, no free text in analytics, calculator inputs never leave the device (Lock L42).
- Identity documents live in a separate private bucket, are viewable only in the restricted viewer, watermarked with the reviewer's identity, every view logged, retention stated (default 24 months after decision), deletion request available after decision.
- Analytics are aggregate and pseudonymous; admins see activity counts, never what a user searched or viewed.
- Every data-collecting screen states its purpose in one sentence in place; the full policy is linked, never gated.
