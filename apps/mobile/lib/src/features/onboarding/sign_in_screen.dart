import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/api/generated/models/sign_in_dto.dart';
import '../../core/auth/session_controller.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_button.dart';
import '../../ui/dt_page.dart';
import '../../ui/dt_text_field.dart';
import '../../ui/error_text.dart';
import 'auth_memory.dart';
import 'onboarding_draft.dart';
import 'password_field.dart';
import 'validators.dart';

/// « Se connecter »: e-mail or phone and password; 5 wrong passwords lock the account 15 minutes.
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  bool _submitting = false;
  ApiError? _error;

  @override
  void initState() {
    super.initState();
    final last = ref.read(lastIdentifierProvider).value;
    if (last != null) _identifier.text = last;
  }

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    super.dispose();
  }

  bool get _valid => isValidIdentifier(_identifier.text) && _password.text.isNotEmpty;

  Future<void> _submit() async {
    if (!_valid || _submitting) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    final sessions = ref.read(sessionControllerProvider.notifier);
    try {
      final tokens = await ref
          .read(apiProvider)
          .auth
          .authControllerSignIn(
            body: SignInDto(
              identifier: _identifier.text.trim(),
              password: _password.text,
              device: await sessions.device(),
            ),
          );
      await sessions.store(tokens);
      await rememberIdentifier(ref, _identifier.text.trim());
      ref.read(onboardingDraftProvider.notifier).reset();
      sessions.enter();
    } catch (error) {
      _password.clear();
      if (mounted) setState(() => _error = ApiError.from(error));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String _errorText(AppLocalizations l10n, ApiError error) => switch (error.code) {
    'INVALID_CREDENTIALS' => l10n.signInInvalid,
    'ACCOUNT_LOCKED' => l10n.signInLocked(timeText(context, error.retryAt)),
    'IDENTIFIER_NOT_CONFIRMED' => l10n.signInNotConfirmed,
    'ACCOUNT_SUSPENDED' => l10n.signInSuspended,
    _ => commonErrorText(context, error),
  };

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return DtPage(
      title: l10n.signInTitle,
      actions: [
        if (_error != null) DtAlert(severity: DtAlertSeverity.critical, body: _errorText(l10n, _error!)),
        DtButton(label: l10n.signInSubmit, loading: _submitting, onPressed: _valid ? _submit : null),
        DtButton(
          label: l10n.signInNoAccount,
          variant: DtButtonVariant.ghost,
          onPressed: () => context.pushReplacement(Routes.role),
        ),
      ],
      children: [
        AutofillGroup(
          child: Column(
            children: [
              DtTextField(
                label: l10n.signUpIdentifier,
                controller: _identifier,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.username, AutofillHints.email],
                textInputAction: TextInputAction.next,
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: DtSpace.s4),
              PasswordField(
                label: l10n.signUpPassword,
                controller: _password,
                onChanged: (_) => setState(() {}),
                onSubmitted: (_) => _submit(),
              ),
            ],
          ),
        ),
        Align(
          alignment: AlignmentDirectional.centerEnd,
          child: DtButton(
            label: l10n.signInForgot,
            variant: DtButtonVariant.ghost,
            size: DtButtonSize.md,
            expand: false,
            onPressed: () => context.push(Routes.resetRequest),
          ),
        ),
      ],
    );
  }
}
