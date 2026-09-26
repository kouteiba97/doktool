import '../../core/api/generated/models/wilaya_dto.dart';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/api/generated/models/professional_type.dart';
import '../../core/api/generated/models/sign_up_dto.dart';
import '../../core/auth/session_controller.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_button.dart';
import '../../ui/dt_page.dart';
import '../../ui/dt_picker.dart';
import '../../ui/dt_text_field.dart';
import '../../ui/error_text.dart';
import '../../ui/tokens.dart';
import '../account/reference_data.dart';
import 'onboarding_draft.dart';
import 'password_field.dart';
import 'validators.dart';

/// ScreenAccountCreate: name, e-mail or phone, password with strength, wilaya, consent. Fields
/// validate on blur; the primary action stays disabled until everything is valid.
class SignUpScreen extends ConsumerStatefulWidget {
  const SignUpScreen({super.key});

  @override
  ConsumerState<SignUpScreen> createState() => _SignUpScreenState();
}

enum _Field { firstName, lastName, identifier, password }

class _SignUpScreenState extends ConsumerState<SignUpScreen> {
  final _controllers = {for (final field in _Field.values) field: TextEditingController()};
  final _focus = {for (final field in _Field.values) field: FocusNode()};
  final _touched = <_Field>{};
  int? _wilayaCode;
  bool _accepted = false;
  bool _submitting = false;
  ApiError? _error;

  @override
  void initState() {
    super.initState();
    for (final entry in _focus.entries) {
      entry.value.addListener(() {
        if (!entry.value.hasFocus && _controllers[entry.key]!.text.isNotEmpty) {
          setState(() => _touched.add(entry.key));
        }
      });
    }
  }

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    for (final node in _focus.values) {
      node.dispose();
    }
    super.dispose();
  }

  String _text(_Field field) => _controllers[field]!.text.trim();

  String? _errorOf(_Field field, AppLocalizations l10n) {
    if (!_touched.contains(field)) return null;
    final value = _text(field);
    switch (field) {
      case _Field.firstName:
      case _Field.lastName:
        return value.isEmpty ? l10n.errorsFieldRequired : null;
      case _Field.identifier:
        return isValidIdentifier(value) ? null : l10n.signUpIdentifierInvalid;
      case _Field.password:
        return passwordStrength(_controllers[field]!.text) == PasswordStrength.tooShort
            ? l10n.signUpPasswordTooShort
            : null;
    }
  }

  bool get _valid =>
      _text(_Field.firstName).isNotEmpty &&
      _text(_Field.lastName).isNotEmpty &&
      isValidIdentifier(_text(_Field.identifier)) &&
      passwordStrength(_controllers[_Field.password]!.text) != PasswordStrength.tooShort &&
      _wilayaCode != null &&
      _accepted;

  Future<void> _submit() async {
    final legal = ref.read(legalProvider).value;
    if (!_valid || legal == null) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    final session = ref.read(sessionControllerProvider.notifier);
    final identifier = _text(_Field.identifier);
    try {
      final challenge = await ref
          .read(apiProvider)
          .auth
          .authControllerSignUp(
            body: SignUpDto(
              identifier: identifier,
              password: _controllers[_Field.password]!.text,
              firstName: _text(_Field.firstName),
              lastName: _text(_Field.lastName),
              wilayaCode: _wilayaCode!,
              acceptTerms: true,
              termsVersion: legal.termsVersion,
              language: session.language(),
            ),
          );
      ref.read(onboardingDraftProvider.notifier).awaitCode(challenge, OtpPurpose.signUp, identifier);
      if (mounted) await context.push(Routes.otp);
    } catch (error) {
      final apiError = ApiError.from(error);
      if (apiError.fields.containsKey('termsVersion')) {
        ref.invalidate(legalProvider);
        setState(() => _accepted = false);
      }
      if (mounted) setState(() => _error = apiError);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String _errorText(AppLocalizations l10n, ApiError error) {
    if (error.code == 'ACCOUNT_EXISTS') return l10n.signUpAccountExists;
    if (error.fields.containsKey('termsVersion')) return l10n.signUpTermsChanged;
    if (error.code == 'CHANNEL_UNAVAILABLE') return l10n.otpChannelUnavailable;
    if (error.code == 'OTP_SEND_LIMIT') return l10n.otpSendLimit;
    if (error.fields.containsKey('identifier')) return l10n.signUpIdentifierInvalid;
    return commonErrorText(context, error);
  }

  Future<void> _open(String? url) async {
    if (url == null) return;
    await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  }

  String _roleName(AppLocalizations l10n, ProfessionalType? role) => switch (role) {
    ProfessionalType.doctor => l10n.roleDoctor,
    ProfessionalType.resident => l10n.roleResident,
    ProfessionalType.student => l10n.roleStudent,
    _ => '',
  };

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final role = ref.watch(onboardingDraftProvider).role;
    final wilayas = ref.watch(wilayasProvider);
    final legal = ref.watch(legalProvider).value;
    final linkStyle = DtType.body.copyWith(color: colors.brand, decoration: TextDecoration.underline);
    final roleName = _roleName(l10n, role);

    return DtPage(
      eyebrow: roleName.isEmpty ? null : '${l10n.commonStepOf('2', '3')} · $roleName',
      title: l10n.signUpTitle,
      actions: [
        if (_error != null)
          DtAlert(
            severity: DtAlertSeverity.critical,
            body: _errorText(l10n, _error!),
            action: _error!.code == 'ACCOUNT_EXISTS'
                ? DtButton(
                    label: l10n.welcomeSignIn,
                    variant: DtButtonVariant.secondary,
                    size: DtButtonSize.md,
                    expand: false,
                    onPressed: () => context.pushReplacement(Routes.signIn),
                  )
                : null,
          ),
        DtButton(label: l10n.signUpSubmit, loading: _submitting, onPressed: _valid && legal != null ? _submit : null),
        Text(
          l10n.signUpCodeNote,
          textAlign: TextAlign.center,
          style: DtType.caption.copyWith(color: colors.inkMuted),
        ),
      ],
      children: [
        AutofillGroup(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: DtTextField(
                      label: l10n.signUpFirstName,
                      controller: _controllers[_Field.firstName]!,
                      focusNode: _focus[_Field.firstName],
                      autofillHints: const [AutofillHints.givenName],
                      textCapitalization: TextCapitalization.words,
                      textInputAction: TextInputAction.next,
                      maxLength: 80,
                      error: _errorOf(_Field.firstName, l10n),
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                  const SizedBox(width: DtSpace.s3),
                  Expanded(
                    child: DtTextField(
                      label: l10n.signUpLastName,
                      controller: _controllers[_Field.lastName]!,
                      focusNode: _focus[_Field.lastName],
                      autofillHints: const [AutofillHints.familyName],
                      textCapitalization: TextCapitalization.words,
                      textInputAction: TextInputAction.next,
                      maxLength: 80,
                      error: _errorOf(_Field.lastName, l10n),
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: DtSpace.s4),
              DtTextField(
                label: l10n.signUpIdentifier,
                controller: _controllers[_Field.identifier]!,
                focusNode: _focus[_Field.identifier],
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email, AutofillHints.telephoneNumber],
                textInputAction: TextInputAction.next,
                error: _errorOf(_Field.identifier, l10n),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: DtSpace.s4),
              PasswordField(
                label: l10n.signUpPassword,
                controller: _controllers[_Field.password]!,
                focusNode: _focus[_Field.password],
                showStrength: true,
                newPassword: true,
                error: _errorOf(_Field.password, l10n),
                onChanged: (_) => setState(() {}),
              ),
            ],
          ),
        ),
        const SizedBox(height: DtSpace.s4),
        DtPickerField<int>(
          label: l10n.signUpWilaya,
          placeholder: l10n.signUpWilayaPick,
          selected: _wilayaCode,
          emptyMessage: wilayas.hasError ? l10n.errorsNetwork : null,
          options: [
            for (final wilaya in wilayas.value ?? const <WilayaDto>[])
              DtPickerOption(value: wilaya.code.toInt(), label: '${wilaya.code} · ${wilaya.name}'),
          ],
          onSelected: (code) => setState(() => _wilayaCode = code),
        ),
        const SizedBox(height: DtSpace.s4),
        MergeSemantics(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Checkbox(
                value: _accepted,
                activeColor: colors.brand,
                onChanged: legal == null ? null : (value) => setState(() => _accepted = value ?? false),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: DtSpace.s3),
                  child: Text.rich(
                    TextSpan(
                      style: DtType.body.copyWith(color: colors.inkSecondary),
                      children: [
                        TextSpan(text: l10n.signUpTermsPrefix),
                        TextSpan(
                          text: l10n.signUpTermsLink,
                          style: legal?.termsUrl == null ? null : linkStyle,
                          recognizer: TapGestureRecognizer()..onTap = () => _open(legal?.termsUrl),
                        ),
                        TextSpan(text: l10n.signUpTermsAnd),
                        TextSpan(
                          text: l10n.signUpPrivacyLink,
                          style: legal?.privacyUrl == null ? null : linkStyle,
                          recognizer: TapGestureRecognizer()..onTap = () => _open(legal?.privacyUrl),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
