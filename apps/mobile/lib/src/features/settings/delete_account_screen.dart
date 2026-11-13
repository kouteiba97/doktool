import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/api/generated/models/delete_account_dto.dart';
import '../../core/auth/session_controller.dart';
import '../../core/database/app_database.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_button.dart';
import '../../ui/dt_page.dart';
import '../../ui/error_text.dart';
import '../../ui/tokens.dart';
import '../onboarding/password_field.dart';
import 'settings_controller.dart';

/// Settings › Compte › « Supprimer mon compte » (section 08): what is erased, what the law keeps,
/// the end of a current subscription without refund, then the password to confirm. The API erases
/// the account; the device then forgets everything the account left on it and returns to Welcome.
class DeleteAccountScreen extends ConsumerStatefulWidget {
  const DeleteAccountScreen({super.key});

  @override
  ConsumerState<DeleteAccountScreen> createState() => _DeleteAccountScreenState();
}

/// The password typed, progress and error.
class _DeleteAccountScreenState extends ConsumerState<DeleteAccountScreen> {
  final _password = TextEditingController();
  bool _deleting = false;
  bool _wrongPassword = false;
  ApiError? _error;

  /// Frees the text controller.
  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  /// « Supprimer mon compte »: deletes the account with the password, then forgets everything on the device.
  Future<void> _delete() async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final session = ref.read(sessionControllerProvider.notifier);
    final database = ref.read(appDatabaseProvider);
    setState(() {
      _deleting = true;
      _wrongPassword = false;
      _error = null;
    });
    try {
      await ref
          .read(apiProvider)
          .account
          .accountDeletionControllerDelete(body: DeleteAccountDto(password: _password.text));
    } catch (error) {
      final apiError = ApiError.from(error);
      if (mounted) {
        setState(() {
          _deleting = false;
          _wrongPassword = apiError.fields.containsKey('password');
          _error = _wrongPassword ? null : apiError;
        });
      }
      return;
    }
    await database.forgetAccountData(keep: SettingsController.deviceKeys);
    await session.signOut();
    messenger.showSnackBar(SnackBar(content: Text(l10n.deleteAccountDone)));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    Widget block(String title, String body) => Padding(
      padding: const EdgeInsets.only(bottom: DtSpace.s4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            header: true,
            child: Text(title, style: DtType.heading.copyWith(color: colors.ink)),
          ),
          const SizedBox(height: DtSpace.s1),
          Text(body, style: DtType.body.copyWith(color: colors.inkSecondary)),
        ],
      ),
    );
    return DtPage(
      title: l10n.deleteAccountTitle,
      intro: l10n.deleteAccountIntro,
      actions: [
        if (_error != null) DtAlert(severity: DtAlertSeverity.critical, body: commonErrorText(context, _error!)),
        // « Supprimer mon compte »: possible once the password is typed.
        DtButton(
          label: l10n.deleteAccountConfirm,
          variant: DtButtonVariant.danger,
          loading: _deleting,
          onPressed: _password.text.isEmpty ? null : _delete,
        ),
      ],
      children: [
        block(l10n.deleteAccountErasedTitle, l10n.deleteAccountErased),
        block(l10n.deleteAccountKeptTitle, l10n.deleteAccountKept),
        DtAlert(severity: DtAlertSeverity.neutral, body: l10n.deleteAccountSubscription),
        const SizedBox(height: DtSpace.s5),
        PasswordField(
          label: l10n.deleteAccountPassword,
          controller: _password,
          error: _wrongPassword ? l10n.deleteAccountWrongPassword : null,
          onChanged: (_) => setState(() => _wrongPassword = false),
          onSubmitted: (_) {
            if (_password.text.isNotEmpty && !_deleting) _delete();
          },
        ),
        const SizedBox(height: DtSpace.s2),
        Text(l10n.deleteAccountPasswordHelp, style: DtType.caption.copyWith(color: colors.inkSecondary)),
      ],
    );
  }
}
