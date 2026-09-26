import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/api/generated/models/password_reset_confirm_dto.dart';
import '../../core/api/generated/models/password_reset_request_dto.dart';
import '../../core/api/generated/models/resend_code_dto.dart';
import '../../core/auth/session_controller.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_button.dart';
import '../../ui/dt_page.dart';
import '../../ui/dt_text_field.dart';
import 'onboarding_draft.dart';
import 'otp_code_input.dart';
import 'otp_screen.dart';
import 'password_field.dart';
import 'resend_timer.dart';
import 'validators.dart';

/// « Mot de passe oublié » step 1: the API always answers with a challenge, whether or not the
/// account exists, so this screen never reveals who has an account.
class ResetRequestScreen extends ConsumerStatefulWidget {
  const ResetRequestScreen({super.key});

  @override
  ConsumerState<ResetRequestScreen> createState() => _ResetRequestScreenState();
}

class _ResetRequestScreenState extends ConsumerState<ResetRequestScreen> {
  final _identifier = TextEditingController();
  bool _sending = false;
  ApiError? _error;

  @override
  void dispose() {
    _identifier.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final identifier = _identifier.text.trim();
      final challenge = await ref
          .read(apiProvider)
          .auth
          .authControllerRequestPasswordReset(
            body: PasswordResetRequestDto(
              identifier: identifier,
              language: ref.read(sessionControllerProvider.notifier).language(),
            ),
          );
      ref.read(onboardingDraftProvider.notifier).awaitCode(challenge, OtpPurpose.passwordReset, identifier);
      if (mounted) await context.push(Routes.resetConfirm);
    } catch (error) {
      if (mounted) setState(() => _error = ApiError.from(error));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final valid = isValidIdentifier(_identifier.text);
    return DtPage(
      title: l10n.resetTitle,
      intro: l10n.resetIntro,
      actions: [
        if (_error != null) DtAlert(severity: DtAlertSeverity.critical, body: otpErrorText(context, _error!)),
        DtButton(label: l10n.resetSend, loading: _sending, onPressed: valid ? _send : null),
      ],
      children: [
        DtTextField(
          label: l10n.signUpIdentifier,
          controller: _identifier,
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.username, AutofillHints.email],
          onChanged: (_) => setState(() {}),
        ),
      ],
    );
  }
}

/// Step 2: the code received and the new password, sent together. Every session of the account
/// is revoked by the API afterwards.
class ResetConfirmScreen extends ConsumerStatefulWidget {
  const ResetConfirmScreen({super.key});

  @override
  ConsumerState<ResetConfirmScreen> createState() => _ResetConfirmScreenState();
}

class _ResetConfirmScreenState extends ConsumerState<ResetConfirmScreen> {
  final _code = TextEditingController();
  final _password = TextEditingController();
  bool _saving = false;
  bool _resending = false;
  ApiError? _error;
  bool _done = false;

  @override
  void dispose() {
    _code.dispose();
    _password.dispose();
    super.dispose();
  }

  bool get _valid =>
      _code.text.length == OtpCodeInput.length && passwordStrength(_password.text) != PasswordStrength.tooShort;

  Future<void> _confirm() async {
    final challenge = ref.read(onboardingDraftProvider).challenge;
    if (challenge == null || !_valid) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref
          .read(apiProvider)
          .auth
          .authControllerConfirmPasswordReset(
            body: PasswordResetConfirmDto(
              challengeId: challenge.challengeId,
              code: _code.text,
              newPassword: _password.text,
            ),
          );
      ref.read(onboardingDraftProvider.notifier).reset();
      if (mounted) setState(() => _done = true);
    } catch (error) {
      _code.clear();
      if (mounted) setState(() => _error = ApiError.from(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _resend() async {
    final draft = ref.read(onboardingDraftProvider);
    final challenge = draft.challenge;
    if (challenge == null) return;
    setState(() => _resending = true);
    try {
      final next = await ref
          .read(apiProvider)
          .auth
          .authControllerResend(
            body: ResendCodeDto(
              challengeId: challenge.challengeId,
              language: ref.read(sessionControllerProvider.notifier).language(),
            ),
          );
      ref.read(onboardingDraftProvider.notifier).awaitCode(next, OtpPurpose.passwordReset, draft.identifier ?? '');
    } catch (error) {
      if (mounted) setState(() => _error = ApiError.from(error));
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    if (_done) {
      return DtPage(
        title: l10n.resetTitle,
        actions: [DtButton(label: l10n.signInSubmit, onPressed: () => context.go(Routes.signIn))],
        children: [DtAlert(severity: DtAlertSeverity.success, body: l10n.resetDone)],
      );
    }
    final challenge = ref.watch(onboardingDraftProvider).challenge;
    return DtPage(
      title: l10n.resetTitle,
      intro: challenge == null ? null : l10n.otpSentTo(challenge.destinationHint),
      actions: [
        if (_error != null) DtAlert(severity: DtAlertSeverity.critical, body: otpErrorText(context, _error!)),
        DtButton(label: l10n.resetConfirm, loading: _saving, onPressed: _valid ? _confirm : null),
        if (challenge != null)
          ResendCodeButton(availableAt: challenge.resendAvailableAt.toLocal(), onResend: _resend, loading: _resending),
      ],
      children: [
        OtpCodeInput(controller: _code, hasError: _error != null, onCompleted: (_) => setState(() {})),
        const SizedBox(height: DtSpace.s6),
        PasswordField(
          label: l10n.resetNewPassword,
          controller: _password,
          showStrength: true,
          newPassword: true,
          onChanged: (_) => setState(() {}),
        ),
      ],
    );
  }
}
