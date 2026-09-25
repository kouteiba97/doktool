# ScreenWelcome
First screen of the Flutter app. Vertical lockup, the promise in one line, and three actions in order of commitment: **Créer un compte**, **Se connecter**, **Explorer la démo** (ghost — present, never pushed). No carousel, no illustrations, no marketing slides.

The demo entry starts a controlled Demo session with no sign-up (section 27, ScreenDemo).

States: default · returning device (Se connecter becomes primary, last e-mail prefilled) · offline (Créer un compte / Démo disabled with "Connexion requise"; a signed-in device opens directly) · maintenance (neutral banner).
