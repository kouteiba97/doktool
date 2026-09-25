# ScreenReferenceViewer
Full-screen, read-only viewer for a reference model (Ordonnance or Certificate), pushed from any list or search row. Top bar: back, title (UI language) with type and file date, favorite, and an overflow with only *Signaler une erreur*. The **reference notice** is pinned under the top bar, caption weight, `ink-secondary`, never dismissible — *« Modèle de référence à adapter au cas clinique. »* / *"Reference model to be adapted to the clinical case."* A small glass floating control over the page offers zoom out / fit / zoom in and the page indicator.

There is **no** export, print, share, download, generate, edit or patient-field control anywhere (Lock L31); the Flutter widget tree must not contain one. The two phones show the language rule: English UI, same French PDF, untouched (section 19).

States: loading (paper-shaped skeleton) · cached offline copy (`Cache · date` chip under the title) · not downloaded while offline · no longer available (favorite of a disabled model) · locked (never reaches this screen — the locked sheet opens instead) · multi-page (page indicator, swipe between pages).
