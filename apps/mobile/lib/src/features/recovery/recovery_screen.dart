import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/api/generated/models/otp_challenge_dto.dart';
import '../../core/api/generated/models/recovery_attach_dto.dart';
import '../../core/api/generated/models/recovery_confirm_dto.dart';
import '../../core/api/generated/models/recovery_photo_slot.dart';
import '../../core/api/generated/models/recovery_start_dto.dart';
import '../../core/api/generated/models/recovery_submit_dto.dart';
import '../../core/api/generated/models/recovery_upload_request_dto.dart';
import '../../core/api/generated/models/resend_code_dto.dart';
import '../../core/auth/session_controller.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_button.dart';
import '../../ui/dt_page.dart';
import '../../ui/dt_text_field.dart';
import '../../ui/error_text.dart';
import '../../ui/glass.dart';
import '../../ui/tokens.dart';
import '../onboarding/otp_code_input.dart';
import '../onboarding/otp_screen.dart';
import '../onboarding/resend_timer.dart';
import '../onboarding/validators.dart';
import '../verification/document_camera_screen.dart';

/// The steps of recovery: the form, the code, the two photos, done.
enum _Step { form, code, photos, done }

/// Where each photo is.
enum _PhotoState { empty, uploading, sent, failed }

/// Signed PUTs of the two photos to private storage (outside the API client: no auth header).
final _recoveryUploadsProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      sendTimeout: const Duration(minutes: 2),
      receiveTimeout: const Duration(seconds: 30),
    ),
  );
  ref.onDispose(dio.close);
  return dio;
});

/// « J’ai tout perdu » (ADR-023): lost contact + names + a new contact proven by a code, then an
/// identity photo and a selfie, then a review by the team. The recovery token stays in memory
/// only; leaving the screen means starting again (it expires after an hour anyway).
class RecoveryScreen extends ConsumerStatefulWidget {
  const RecoveryScreen({super.key});

  @override
  ConsumerState<RecoveryScreen> createState() => _RecoveryScreenState();
}

/// Everything the recovery steps need: the texts typed, the request, the code challenge, the token and photos.
class _RecoveryScreenState extends ConsumerState<RecoveryScreen> {
  final _lost = TextEditingController();
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _fresh = TextEditingController();
  final _code = TextEditingController();

  _Step _step = _Step.form;
  bool _busy = false;
  bool _resending = false;
  ApiError? _error;
  String? _requestId;
  OtpChallengeDto? _challenge;
  String? _token;
  int _answerHours = 72;
  final Map<RecoveryPhotoSlot, _PhotoState> _photos = {
    RecoveryPhotoSlot.identityDocument: _PhotoState.empty,
    RecoveryPhotoSlot.selfie: _PhotoState.empty,
  };

  /// Frees the text controllers.
  @override
  void dispose() {
    for (final controller in [_lost, _firstName, _lastName, _fresh, _code]) {
      controller.dispose();
    }
    super.dispose();
  }

  bool get _formValid =>
      isValidIdentifier(_lost.text) &&
      isValidIdentifier(_fresh.text) &&
      _firstName.text.trim().isNotEmpty &&
      _lastName.text.trim().isNotEmpty;

  /// Runs one step with the busy flag and shows its error if it fails.
  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (error) {
      if (mounted) setState(() => _error = ApiError.from(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Step 1: the lost contact, names and a new contact; a code is sent to the new contact.
  Future<void> _start() => _run(() async {
    final started = await ref
        .read(apiProvider)
        .auth
        .accountRecoveryControllerStart(
          body: RecoveryStartDto(
            lostIdentifier: _lost.text.trim(),
            newIdentifier: _fresh.text.trim(),
            firstName: _firstName.text.trim(),
            lastName: _lastName.text.trim(),
            language: ref.read(sessionControllerProvider.notifier).language(),
          ),
        );
    setState(() {
      _requestId = started.requestId;
      _challenge = started.challenge;
      _step = _Step.code;
    });
  });

  /// Step 2: the code proves the new contact; the API gives a token for the photos.
  Future<void> _confirm() => _run(() async {
    final challenge = _challenge;
    if (challenge == null || _requestId == null) return;
    try {
      final token = await ref
          .read(apiProvider)
          .auth
          .accountRecoveryControllerConfirm(
            body: RecoveryConfirmDto(requestId: _requestId!, challengeId: challenge.challengeId, code: _code.text),
          );
      setState(() {
        _token = token.recoveryToken;
        _step = _Step.photos;
      });
    } catch (_) {
      _code.clear();
      rethrow;
    }
  });

  /// « Renvoyer le code ».
  Future<void> _resend() async {
    final challenge = _challenge;
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
      if (mounted) setState(() => _challenge = next);
    } catch (error) {
      if (mounted) setState(() => _error = ApiError.from(error));
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  /// Step 3: takes the identity photo or the selfie and uploads it to private storage.
  Future<void> _takePhoto(RecoveryPhotoSlot slot, String title) async {
    final path = await DocumentCameraScreen.capture(context, title, selfie: slot == RecoveryPhotoSlot.selfie);
    if (path == null || _token == null) return;
    setState(() {
      _photos[slot] = _PhotoState.uploading;
      _error = null;
    });
    try {
      final bytes = await File(path).readAsBytes();
      final api = ref.read(apiProvider).auth;
      final ticket = await api.accountRecoveryControllerUpload(
        body: RecoveryUploadRequestDto(
          recoveryToken: _token!,
          slot: slot,
          contentType: 'image/jpeg',
          sizeBytes: bytes.length,
          sha256: sha256.convert(bytes).toString(),
        ),
      );
      await ref
          .read(_recoveryUploadsProvider)
          .put<void>(
            ticket.url,
            data: Stream.fromIterable([bytes]),
            options: Options(
              headers: {
                Headers.contentTypeHeader: ticket.headers.contentType,
                Headers.contentLengthHeader: ticket.headers.contentLength,
              },
            ),
          );
      await api.accountRecoveryControllerAttach(
        body: RecoveryAttachDto(recoveryToken: _token!, slot: slot, intentId: ticket.intentId),
      );
      if (mounted) setState(() => _photos[slot] = _PhotoState.sent);
    } catch (error) {
      if (mounted) {
        setState(() {
          _photos[slot] = _PhotoState.failed;
          _error = ApiError.from(error);
        });
      }
    } finally {
      // The photo lives only until it is sent: never kept on the phone.
      await File(path).delete().catchError((Object _) => File(path));
    }
  }

  /// « Envoyer la demande »: the team reviews it; once approved it applies after 24 hours.
  Future<void> _submit() => _run(() async {
    final submitted = await ref
        .read(apiProvider)
        .auth
        .accountRecoveryControllerSubmit(body: RecoverySubmitDto(recoveryToken: _token!));
    setState(() {
      _answerHours = submitted.answerWithinHours.toInt();
      _token = null;
      _step = _Step.done;
    });
  });

  /// The message for each refusal of the recovery steps.
  String _errorText(AppLocalizations l10n, ApiError error) => switch (error.code) {
    'ACCOUNT_EXISTS' => l10n.recoveryAccountExists,
    'CHALLENGE_INVALID' => l10n.recoveryExpired,
    'VALIDATION_FAILED' when error.fields.containsKey('newIdentifier') => l10n.recoverySameContact,
    'OTP_INVALID' ||
    'OTP_EXPIRED' ||
    'OTP_LOCKED' ||
    'OTP_SEND_LIMIT' ||
    'OTP_RESEND_TOO_SOON' ||
    'CHANNEL_UNAVAILABLE' => otpErrorText(context, error),
    _ => commonErrorText(context, error),
  };

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final error = _error;
    final alert = error == null ? null : DtAlert(severity: DtAlertSeverity.critical, body: _errorText(l10n, error));
    return switch (_step) {
      _Step.form => DtPage(
        title: l10n.recoveryTitle,
        intro: l10n.recoveryIntro,
        actions: [
          ?alert,
          // « Envoyer le code »: needs the lost contact, the names and a new contact.
          DtButton(label: l10n.recoverySendCode, loading: _busy, onPressed: _formValid ? _start : null),
        ],
        children: [
          DtTextField(
            label: l10n.recoveryLostIdentifier,
            controller: _lost,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: DtSpace.s4),
          DtTextField(
            label: l10n.signUpFirstName,
            controller: _firstName,
            textCapitalization: TextCapitalization.words,
            autofillHints: const [AutofillHints.givenName],
            textInputAction: TextInputAction.next,
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: DtSpace.s4),
          DtTextField(
            label: l10n.signUpLastName,
            controller: _lastName,
            textCapitalization: TextCapitalization.words,
            autofillHints: const [AutofillHints.familyName],
            textInputAction: TextInputAction.next,
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: DtSpace.s4),
          DtTextField(
            label: l10n.recoveryNewIdentifier,
            helper: l10n.recoveryNewIdentifierHelp,
            controller: _fresh,
            keyboardType: TextInputType.emailAddress,
            onChanged: (_) => setState(() {}),
          ),
        ],
      ),
      _Step.code => DtPage(
        title: l10n.recoveryTitle,
        intro: _challenge == null ? null : l10n.otpSentTo(_challenge!.destinationHint),
        onBack: () => setState(() => _step = _Step.form),
        actions: [
          ?alert,
          // « Vérifier »: possible once the six digits are typed.
          DtButton(
            label: l10n.recoveryVerify,
            loading: _busy,
            onPressed: _code.text.length == OtpCodeInput.length ? _confirm : null,
          ),
          if (_challenge != null)
            ResendCodeButton(
              availableAt: _challenge!.resendAvailableAt.toLocal(),
              onResend: _resend,
              loading: _resending,
            ),
        ],
        children: [OtpCodeInput(controller: _code, hasError: error != null, onCompleted: (_) => setState(() {}))],
      ),
      _Step.photos => DtPage(
        title: l10n.recoveryTitle,
        intro: l10n.recoveryPhotosIntro,
        showBack: false,
        actions: [
          ?alert,
          // « Envoyer la demande »: possible once both photos are sent.
          DtButton(
            label: l10n.recoverySubmit,
            loading: _busy,
            onPressed: _photos.values.every((state) => state == _PhotoState.sent) ? _submit : null,
          ),
        ],
        children: [
          _PhotoTile(
            title: l10n.recoveryIdentityPhoto,
            help: l10n.recoveryIdentityHelp,
            icon: LucideIcons.idCard,
            state: _photos[RecoveryPhotoSlot.identityDocument]!,
            onTake: () => _takePhoto(RecoveryPhotoSlot.identityDocument, l10n.recoveryIdentityPhoto),
          ),
          const SizedBox(height: DtSpace.s3),
          _PhotoTile(
            title: l10n.recoverySelfie,
            help: l10n.recoverySelfieHelp,
            icon: LucideIcons.scanFace,
            state: _photos[RecoveryPhotoSlot.selfie]!,
            onTake: () => _takePhoto(RecoveryPhotoSlot.selfie, l10n.recoverySelfie),
          ),
        ],
      ),
      _Step.done => DtPage(
        title: l10n.recoveryDoneTitle,
        showBack: false,
        // « Retour à la connexion ».
        actions: [DtButton(label: l10n.recoveryBackToSignIn, onPressed: () => context.go(Routes.signIn))],
        children: [
          DtAlert(severity: DtAlertSeverity.success, body: l10n.recoveryDoneBody('$_answerHours', _fresh.text.trim())),
        ],
      ),
    };
  }
}

/// One photo slot: what to photograph, and its state (to take, sending, sent, failed).
class _PhotoTile extends StatelessWidget {
  const _PhotoTile({
    required this.title,
    required this.help,
    required this.icon,
    required this.state,
    required this.onTake,
  });

  final String title;
  final String help;
  final IconData icon;
  final _PhotoState state;
  final VoidCallback onTake;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final sent = state == _PhotoState.sent;
    return DtLiftedCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(sent ? LucideIcons.circleCheck : icon, color: sent ? colors.success : colors.brand),
              const SizedBox(width: DtSpace.s3),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(title, style: DtType.heading.copyWith(color: colors.ink)),
                ),
              ),
            ],
          ),
          const SizedBox(height: DtSpace.s2),
          Text(switch (state) {
            _PhotoState.sent => l10n.recoveryPhotoSent,
            _PhotoState.uploading => l10n.recoveryUploading,
            _PhotoState.failed => l10n.recoveryUploadFailed,
            _PhotoState.empty => help,
          }, style: DtType.body.copyWith(color: state == _PhotoState.failed ? colors.critical : colors.inkSecondary)),
          if (state == _PhotoState.uploading) ...[
            const SizedBox(height: DtSpace.s2),
            LinearProgressIndicator(color: colors.brand, backgroundColor: colors.surfaceSunken),
          ] else ...[
            const SizedBox(height: DtSpace.s3),
            // « Prendre la photo » / « Reprendre ».
            DtButton(
              label: sent ? l10n.recoveryRetake : l10n.recoveryTakePhoto,
              icon: LucideIcons.camera,
              variant: sent ? DtButtonVariant.secondary : DtButtonVariant.primary,
              size: DtButtonSize.md,
              expand: false,
              onPressed: onTake,
            ),
          ],
        ],
      ),
    );
  }
}
