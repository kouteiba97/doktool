# ScreenProfileMobile
Every real account (doctor, resident, student) has this profile. Header: photo (R2 `profile-images`, re-encoded and stripped of metadata), name, type · specialty · city, verification and access badges, *Modifier* (name, photo, bio ≤ 280 characters, professional or student information). Then: **Activité** (research history), **Favoris**, **Abonnement** (students see "Accès étudiant — gratuit"), **Vérification et confiance**; **Paramètres** (Apparence clair/sombre, Langue FR/EN, Notifications, Sécurité, Données et hors ligne); **Se déconnecter**.

No practice/cabinet block — it only existed to render generated documents, which V1 does not do. States: loading · saved (toast) · photo uploading · offline (read-only, edits queued).
