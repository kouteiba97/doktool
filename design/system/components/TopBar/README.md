# TopBar

> **Future roadmap — DokTool Web (not V1).** V1 has no user web application (Lock L33). This card is a *layout* reference for a future web client; its content predates V1 and may show deferred modules. See section 25.
The 56px Clinical Glass bar of the web app: brand wordmark, the global search trigger, verification badge, notifications and the avatar.

**Anatomy** `dt-glass` with no radius at the page top (the preview rounds it); wordmark (`heading` weight); search trigger (36px well on `surface-sunken`, opens `SearchCommand`); `VerificationStatus` badge (teal Vérifié · neutral En attente · warning Expire bientôt · critical Rejeté); notifications icon button with an unread dot in `brand`; avatar with a status dot. Admin console uses the same bar on `navy` with `on-navy` text and no glass.

**Consumer provides** user initials, verification state, unread count, search handler. Don't: put page titles in the bar; add more than two icon buttons.
