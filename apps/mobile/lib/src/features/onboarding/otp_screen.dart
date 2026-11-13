import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/api/generated/models/confirm_sign_up_dto.dart';
import '../../core/api/generated/models/resend_code_dto.dart';
import '../../core/api/generated/models/set_professional_profile_dto.dart';
import '../../core/auth/session_controller.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_button.dart';
import '../../ui/dt_page.dart';
import '../../ui/error_text.dart';
import '../../ui/tokens.dart';
import 'auth_memory.dart';
import 'onboarding_draft.dart';
import 'otp_code_input.dart';
import 'resend_timer.dart';

/// Sign-up confirmation (step 3 of 3): 6 boxes, resend after 60 s, 3 tries then a 10-minute lock
/// (ADR-009). On success the role chosen earlier is recorded and verification starts.
class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key});

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

/// The code typed, progress flags and the last error.
class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _code = TextEditingController();
  bool _verifying = false;
  bool _resending = false;
  ApiError? _error;
  bool _resent = false;

  /// Frees the text controller.
  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  /// Checks the six-digit code; a confirmed sign-up signs in and continues onboarding.
  Future<void> _verify(String code) async {
    final draft = ref.read(onboardingDraftProvider);
    final challenge = draft.challenge;
    if (challenge == null || _verifying) return;
    setState(() {
      _verifying = true;
      _error = null;
      _resent = false;
    });
    final sessions = ref.read(sessionControllerProvider.notifier);
    final api = ref.read(apiProvider);
    try {
      final tokens = await api.auth.authControllerConfirmSignUp(
        body: ConfirmSignUpDto(challengeId: challenge.challengeId, code: code, device: await sessions.device()),
      );
      await sessions.store(tokens);
      final role = draft.role;
      if (role != null) {
        try {
          await api.account.usersControllerSetProfessionalProfile(
            body: SetProfessionalProfileDto(professionalType: role),
          );
        } catch (error) {
          // The account exists; « Qui êtes-vous ? » is asked again after sign-in if this failed.
          if (ApiError.from(error).code != 'PROFILE_ALREADY_SET') {
            ref.read(onboardingDraftProvider.notifier).reset();
          }
        }
      }
      if (draft.identifier != null) await rememberIdentifier(ref, draft.identifier!);
      ref.read(onboardingDraftProvider.notifier).signedUp(Routes.verificationIntro);
      sessions.enter();
    } catch (error) {
      _code.clear();
      if (mounted) setState(() => _error = ApiError.from(error));
    } finally {
      if (mounted) setState(() => _verifying = false);
    }
  }

  /// « Renvoyer le code »: asks for a new code (the timer prevents asking too often).
  Future<void> _resend() async {
    final draft = ref.read(onboardingDraftProvider);
    final challenge = draft.challenge;
    if (challenge == null) return;
    setState(() {
      _resending = true;
      _error = null;
    });
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
      ref
          .read(onboardingDraftProvider.notifier)
          .awaitCode(next, draft.purpose ?? OtpPurpose.signUp, draft.identifier ?? '');
      if (mounted) setState(() => _resent = true);
    } catch (error) {
      if (mounted) setState(() => _error = ApiError.from(error));
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final challenge = ref.watch(onboardingDraftProvider).challenge;
    if (challenge == null) {
      return DtPage(
        title: l10n.otpTitle,
        children: [Text(l10n.otpExpired, style: DtType.body.copyWith(color: colors.ink))],
      );
    }
    final locked = _error?.code == 'OTP_LOCKED';
    return DtPage(
      eyebrow: l10n.commonStepOf('3', '3'),
      title: l10n.otpTitle,
      intro: l10n.otpSentTo(challenge.destinationHint),
      actions: [
        // « Vérifier »: possible once the six digits are typed (not while locked).
        DtButton(
          label: l10n.otpVerify,
          loading: _verifying,
          onPressed: _code.text.length == OtpCodeInput.length && !locked ? () => _verify(_code.text) : null,
        ),
        ResendCodeButton(availableAt: challenge.resendAvailableAt.toLocal(), onResend: _resend, loading: _resending),
      ],
      children: [
        OtpCodeInput(
          controller: _code,
          hasError: _error != null,
          enabled: !_verifying && !locked,
          onCompleted: _verify,
        ),
        const SizedBox(height: DtSpace.s4),
        if (_error != null)
          DtAlert(severity: DtAlertSeverity.critical, body: otpErrorText(context, _error!))
        else if (_resent)
          DtAlert(severity: DtAlertSeverity.success, body: l10n.otpResent),
      ],
    );
  }
}

/// Messages of the OTP errors, shared with the password reset.
String otpErrorText(BuildContext context, ApiError error) {
  final l10n = AppLocalizations.of(context);
  return switch (error.code) {
    'OTP_INVALID' => l10n.otpInvalid(error.attemptsRemaining ?? 0),
    'OTP_EXPIRED' || 'CHALLENGE_INVALID' => l10n.otpExpired,
    'OTP_LOCKED' => l10n.otpLocked(timeText(context, error.retryAt)),
    'OTP_SEND_LIMIT' => l10n.otpSendLimit,
    'OTP_RESEND_TOO_SOON' => l10n.otpResendIn('${error.retryAt?.difference(DateTime.now()).inSeconds ?? 60}'),
    'CHANNEL_UNAVAILABLE' => l10n.otpChannelUnavailable,
    _ => commonErrorText(context, error),
  };
}
