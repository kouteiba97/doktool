# ScreenVerifyProfessional
Step 2 of doctor verification. Identity and professional status are **separate verification cases** decided independently (section 06); this step collects the Ordre number (numeric keypad), the attestation (camera-first `FileUpload`, legibility checked on device), and the specialty (picker, never typed). Residents see Résidanat + année + Établissement (picker); students see Université (picker) + année + carte d’étudiant — same layout.

Files go to the private verification bucket through a signed upload URL (section 26). Required fields say "requis" in words.
States: empty · uploading · illegible (glare, cut, blur — retake) · offline (captured and queued, sent on reconnect) · resumed from another device.
