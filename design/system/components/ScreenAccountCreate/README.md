# ScreenAccountCreate
Minimal account form: name, e-mail or phone, password with strength, wilaya, consent. Validation is inline and on blur; the primary stays disabled until valid. Followed by an OTP screen (6 boxes, resend after 60 s, paste supported).

States: pristine · invalid field (message under the field, focus moves to the first error on submit) · submitting (spinner in button) · account exists ("Ce compte existe déjà — se connecter ?") · OTP sent · OTP wrong (3 tries then 10-minute lock) · offline (disabled with reason).
