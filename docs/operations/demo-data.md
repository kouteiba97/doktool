# Demonstration data (demos, store screenshots, walkthroughs)

`npm run demo:seed -w @doktool/api` fills an **empty demonstration database** with fictitious but realistic data, so demos and screenshots never show test leftovers such as « Angine 9ced2e » or « Test CALCULATOR_EDITOR ».

## What it creates

- **The team:** six admins, one per role (Super Admin, editor, clinical reviewer, verification reviewer, library manager, finance). Each gets a random password, printed once. TOTP enrolment happens at first sign-in, as for any admin.
- **Reference lists:** specialties, universities, and the university hospitals of nine wilayas.
- **Plans:** « Pro mensuel » and « Pro annuel » at demonstration prices, plus Chargily and SATIM fee rates. The Super Admin sets the real values in production.
- **About 60 users** (doctors, residents, students) with Algerian names and `@demo.doktool.dz` addresses:
  - most of them verified, about ten waiting in the verification queue, a few rejected;
  - three **showcase accounts**: a Pro doctor, an unpaid resident and a student, sharing one printed password.
- **Six months of activity:**
  - subscriptions, renewals and a few failed card payments (`DT-…` numbers in date order);
  - operating expenses;
  - thirty days of anonymous analytics, demo visitors included;
  - an audit trail of the team's decisions.
- **A reference library:** 10 ordonnances and 6 certificates. Every PDF is labelled « Document de démonstration ». The ordonnances contain no prescription; the certificates are blank administrative templates.

## What it never creates

- calculator formulas;
- pregnancy · lactation profiles;
- prescription content.

These are clinical content: the medical team authors and reviews them in Admin Web (section 28, ADR-019, ADR-024). Nothing clinical is ever generated. For screenshots of the calculators and of « Grossesse », publish the doctor's real content in the demonstration database through the normal review.

## Run it

1. Create an empty database whose name ends in `_demo`, then apply the migrations:

   ```bash
   DATABASE_URL="postgresql://…/doktool_demo" npm run prisma:migrate:deploy -w @doktool/api
   ```

2. Seed it:

   ```bash
   DATABASE_URL="postgresql://…/doktool_demo" npm run demo:seed -w @doktool/api
   ```

3. Keep the printed passwords: they are not shown again.

4. Point the API at that database to present it:
   - Admin Web: sign in with an admin account;
   - mobile app: sign in with a showcase account.

## Safety

The script refuses:
- a database whose name does not end in `_demo`;
- `NODE_ENV=production`;
- a database that already holds an account.

It never touches the real database. Its names and numbers are invented: any resemblance to a real person is a coincidence. The data is deterministic: two runs on empty databases give the same people and the same figures (passwords excepted).
