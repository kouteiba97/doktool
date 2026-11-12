# ADR-028 · Publishing the Medicalcul calculation formats

**Status:** Accepted · 12 November 2026 (Product Owner)

**Context:** 147 calculators were imported from Medicalcul as drafts (`docs/medicalcul-integration/`). Their formulas, points and thresholds were translated by a deterministic, tested adapter; nothing was written by AI. They stayed unusable because every draft still needed a primary source, test cases, limitations, English texts and a second admin's review, to be done by hand for each one. The Product Owner states that Dr Ph. Mignard, Medicalcul's author, has agreed to the reuse, and decides that these formats are published as they are, since they come from a tool already in clinical use.

The rule « never generate or alter a formula with AI » (CLAUDE.md, section 28) is unchanged: it forbids writing or changing clinical content, in Admin Web or anywhere else. Publishing a format extracted from its source is not that.

## Decision

1. **A script publishes the imported drafts** (`npm run medicalcul:publish -w @doktool/api`). It goes through `CalculatorsAdminService`, the service Admin Web uses, so every gate still applies: a primary source, test cases that pass, an author who is not the reviewer, the clinical review policy (ADR-024), and an audit entry for each step.

2. **What the script adds is mechanical.**

   | Gap | Filled with |
   |---|---|
   | Primary source | The Medicalcul page itself (author, page URL, data version), with the references that page cites |
   | Test cases | Values computed by **Medicalcul's own page script** for 3 to 6 sets of answers. DokTool's engine must give the same value on every set where the page gives a number, and no result where the page gives none |
   | Limitations | One sentence: where the format comes from, and that the source does not state limits of use or excluded populations |
   | Limits on numeric fields | Hard ranges that refuse impossible entries only (below) |

3. **A calculator that differs from its source is not published.** One differing answer set, or a page script that cannot be run, leaves the calculator as a draft and lists it. On the archive of 30 September 2026 all 147 agree; an altered formula is refused for all 147.

4. **Entry limits are not clinical ranges.**

   | Field | Hard range | Why |
   |---|---|---|
   | Age, in years | 0 to 130 | No one is older |
   | Weight, in kg | 0.2 to 700 | Outside human weights |
   | Height (« Taille »), in cm | 20 to 300 | Also catches metres typed for centimetres |
   | Any percentage | 0 to 100 | Definition of a percentage |
   | Answers the page scales « 0 = absent, 10 = extrême » | 0 to 10 | Stated by the page |
   | Every other number | not negative | None of these quantities can be negative |

   `validatedRange` and `plausibleRange` stay empty. Setting them is clinical work from the primary literature.

5. **Medicalcul's code runs only in that script,** on the machine holding the archive, to produce the expected values. It never runs in the API, Admin Web or the app (unchanged from the integration notes).

6. **Drafts a person has edited are left alone.** The script touches a draft only while it is byte-identical to the import.

## Known gaps after publication

These are visible to doctors and are for the clinical team to close, each as a new version reviewed as usual:

- English labels are the French ones.
- Interpretation bands exist for 26 calculators only, all with severity « info ».
- No validated or plausible ranges: a possible but unusual value gives a result without a note.
- Limitations are the generic sentence above.
- The 253 other Medicalcul pages are not covered (they need engine extensions or are reference tables).

## Consequences

- Students and professionals see 147 calculators (all `accessTier = STUDENT`, ADR-006 Q2); they are also installed offline, where each version runs its test cases on the phone before first use.
- The script is repeatable: on another database it publishes whatever is still an untouched import and skips the rest.
- It needs two admin accounts (author and reviewer), and two reviewers when the review policy asks for a double sign-off.
