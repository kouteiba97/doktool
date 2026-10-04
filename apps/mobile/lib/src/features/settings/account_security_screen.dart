import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/api/generated/models/account_contacts_dto.dart';
import '../../core/api/generated/models/contact_confirm_dto.dart';
import '../../core/api/generated/models/contact_remove_dto.dart';
import '../../core/api/generated/models/contact_request_dto.dart';
import '../../core/api/generated/models/message_channel.dart';
import '../../core/api/generated/models/otp_challenge_dto.dart';
import '../../core/api/generated/models/password_change_dto.dart';
import '../../core/api/generated/models/pending_recovery_dto_status.dart';
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
import '../../ui/skeleton.dart';
import '../../ui/tokens.dart';
import '../account/account_controller.dart';
import '../notifications/notifications_screen.dart';
import '../onboarding/otp_code_input.dart';
import '../onboarding/otp_screen.dart';
import '../onboarding/password_field.dart';
import '../onboarding/validators.dart';

/// The e-mail and phone of the account, whether both are confirmed, and any recovery in progress.
final accountContactsProvider = FutureProvider.autoDispose<AccountContactsDto>(
  (ref) => ref.watch(apiProvider).account.accountSecurityControllerContacts(),
);

/// Settings › « Coordonnées et sécurité » (ADR-023): both contacts (so losing one never locks the
/// person out), the password, and « Ce n’est pas moi » when someone asks to recover the account.
class AccountSecurityScreen extends ConsumerStatefulWidget {
  const AccountSecurityScreen({super.key});

  @override
  ConsumerState<AccountSecurityScreen> createState() => _AccountSecurityScreenState();
}

class _AccountSecurityScreenState extends ConsumerState<AccountSecurityScreen> {
  bool _canceling = false;
  String? _notice;

  Future<void> _cancelRecovery() async {
    final l10n = AppLocalizations.of(context);
    setState(() => _canceling = true);
    try {
      await ref.read(apiProvider).account.accountSecurityControllerCancelRecovery();
      ref
        ..invalidate(accountContactsProvider)
        ..invalidate(notificationsProvider);
      if (mounted) setState(() => _notice = l10n.securityRecoveryCanceled);
    } catch (error) {
      if (mounted) setState(() => _notice = commonErrorText(context, ApiError.from(error)));
    } finally {
      if (mounted) setState(() => _canceling = false);
    }
  }

  Future<void> _remove(MessageChannel channel) async {
    final removed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _RemoveContactSheet(channel: channel),
    );
    if (removed == true && mounted) {
      ref
        ..invalidate(accountContactsProvider)
        ..invalidate(accountControllerProvider)
        ..invalidate(notificationsProvider);
      setState(() => _notice = AppLocalizations.of(context).contactRemoved);
    }
  }

  Future<void> _edit(MessageChannel channel, bool exists) async {
    final saved = await context.push<bool>(
      Routes.contactEdit(channel == MessageChannel.email ? 'email' : 'phone', exists),
    );
    if (saved == true && mounted) {
      ref
        ..invalidate(accountContactsProvider)
        ..invalidate(accountControllerProvider)
        ..invalidate(notificationsProvider);
      setState(() => _notice = AppLocalizations.of(context).contactSaved);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final contacts = ref.watch(accountContactsProvider);
    return DtPage(
      title: l10n.securityTitle,
      children: [
        if (_notice != null) ...[
          DtAlert(severity: DtAlertSeverity.success, body: _notice!),
          const SizedBox(height: DtSpace.s4),
        ],
        switch (contacts) {
          AsyncData(:final value) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (value.pendingRecovery != null) ...[
                DtAlert(
                  severity: DtAlertSeverity.warning,
                  body:
                      value.pendingRecovery!.status == PendingRecoveryDtoStatus.approved &&
                          value.pendingRecovery!.effectiveAt != null
                      ? l10n.securityPendingApproved(
                          DateFormat.yMMMMd(Localizations.localeOf(context).toLanguageTag())
                              .add_Hm()
                              .format(value.pendingRecovery!.effectiveAt!.toLocal()),
                        )
                      : l10n.securityPendingSubmitted,
                  action: DtButton(
                    label: l10n.securityNotMe,
                    variant: DtButtonVariant.danger,
                    size: DtButtonSize.md,
                    expand: false,
                    loading: _canceling,
                    onPressed: _cancelRecovery,
                  ),
                ),
                const SizedBox(height: DtSpace.s4),
              ],
              DtLiftedCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(
                      header: true,
                      child: Text(l10n.securityContacts, style: DtType.heading.copyWith(color: colors.ink)),
                    ),
                    const SizedBox(height: DtSpace.s2),
                    _ContactRow(
                      icon: LucideIcons.mail,
                      label: l10n.securityEmail,
                      value: value.email,
                      canRemove: value.email != null && value.phoneConfirmed,
                      onEdit: () => _edit(MessageChannel.email, value.email != null),
                      onRemove: () => _remove(MessageChannel.email),
                    ),
                    Divider(height: DtBorder.hairline, thickness: DtBorder.hairline, color: colors.border),
                    _ContactRow(
                      icon: LucideIcons.smartphone,
                      label: l10n.securityPhone,
                      value: value.phone,
                      canRemove: value.phone != null && value.emailConfirmed,
                      onEdit: () => _edit(MessageChannel.sms, value.phone != null),
                      onRemove: () => _remove(MessageChannel.sms),
                    ),
                    const SizedBox(height: DtSpace.s3),
                    DtAlert(
                      severity: value.recoverable ? DtAlertSeverity.success : DtAlertSeverity.info,
                      body: value.recoverable
                          ? l10n.securityRecoverable
                          : l10n.securityNotRecoverable(value.email == null ? 'EMAIL' : 'PHONE'),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: DtSpace.s4),
              DtLiftedCard(
                padding: EdgeInsets.zero,
                child: Material(
                  type: MaterialType.transparency,
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: DtSpace.s4, vertical: DtSpace.s1),
                    leading: Icon(LucideIcons.keyRound, color: colors.inkSecondary),
                    title: Text(l10n.securityChangePassword, style: DtType.body.copyWith(color: colors.ink)),
                    subtitle: Text(
                      l10n.securityPasswordHelp,
                      style: DtType.caption.copyWith(color: colors.inkSecondary),
                    ),
                    trailing: Icon(LucideIcons.chevronRight, color: colors.inkMuted),
                    onTap: () async {
                      final saved = await context.push<bool>(Routes.passwordChange);
                      if (saved == true && mounted) {
                        ref.invalidate(notificationsProvider);
                        setState(() => _notice = l10n.passwordSaved);
                      }
                    },
                  ),
                ),
              ),
            ],
          ),
          AsyncError(:final error) => DtAlert(
            severity: DtAlertSeverity.critical,
            body: commonErrorText(context, ApiError.from(error)),
            action: DtButton(
              label: l10n.commonRetry,
              size: DtButtonSize.md,
              expand: false,
              onPressed: () => ref.invalidate(accountContactsProvider),
            ),
          ),
          _ => const SkeletonRows(count: 4),
        },
      ],
    );
  }
}

class _ContactRow extends StatelessWidget {
  const _ContactRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.canRemove,
    required this.onEdit,
    required this.onRemove,
  });

  final IconData icon;
  final String label;
  final String? value;
  final bool canRemove;
  final VoidCallback onEdit;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: DtSpace.s2),
      child: Row(
        children: [
          Icon(icon, color: colors.inkSecondary, size: DtSpace.s5),
          const SizedBox(width: DtSpace.s3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: DtType.caption.copyWith(color: colors.inkMuted)),
                Text(
                  value ?? l10n.securityNone,
                  style: DtType.body.copyWith(color: value == null ? colors.inkMuted : colors.ink),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          if (canRemove)
            DtButton(
              label: l10n.securityRemove,
              variant: DtButtonVariant.ghost,
              size: DtButtonSize.sm,
              expand: false,
              onPressed: onRemove,
            ),
          DtButton(
            label: value == null ? l10n.securityAdd : l10n.securityChange,
            variant: DtButtonVariant.secondary,
            size: DtButtonSize.sm,
            expand: false,
            onPressed: onEdit,
          ),
        ],
      ),
    );
  }
}

/// « Retirer »: confirmed with the password; the other contact stays.
class _RemoveContactSheet extends ConsumerStatefulWidget {
  const _RemoveContactSheet({required this.channel});

  final MessageChannel channel;

  @override
  ConsumerState<_RemoveContactSheet> createState() => _RemoveContactSheetState();
}

class _RemoveContactSheetState extends ConsumerState<_RemoveContactSheet> {
  final _password = TextEditingController();
  bool _busy = false;
  ApiError? _error;

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  Future<void> _remove() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(apiProvider)
          .account
          .accountSecurityControllerRemoveContact(
            body: ContactRemoveDto(channel: widget.channel, password: _password.text),
          );
      if (mounted) Navigator.of(context).pop(true);
    } catch (error) {
      if (mounted) setState(() => _error = ApiError.from(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final error = _error;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        DtSpace.s4,
        DtSpace.s6,
        DtSpace.s4,
        DtSpace.s6 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.contactRemoveTitle(widget.channel == MessageChannel.email ? 'EMAIL' : 'SMS'),
            style: DtType.title.copyWith(color: colors.ink),
          ),
          const SizedBox(height: DtSpace.s2),
          Text(l10n.contactRemoveBody, style: DtType.body.copyWith(color: colors.inkSecondary)),
          const SizedBox(height: DtSpace.s4),
          PasswordField(label: l10n.contactPassword, controller: _password, onChanged: (_) => setState(() {})),
          if (error != null) ...[
            const SizedBox(height: DtSpace.s3),
            DtAlert(severity: DtAlertSeverity.critical, body: _contactErrorText(context, error, removing: true)),
          ],
          const SizedBox(height: DtSpace.s4),
          DtButton(
            label: l10n.securityRemove,
            variant: DtButtonVariant.danger,
            loading: _busy,
            onPressed: _password.text.isEmpty ? null : _remove,
          ),
        ],
      ),
    );
  }
}

String _contactErrorText(BuildContext context, ApiError error, {bool removing = false}) {
  final l10n = AppLocalizations.of(context);
  return switch (error.code) {
    'VALIDATION_FAILED' when error.fields.containsKey('password') || error.fields.containsKey('currentPassword') =>
      l10n.contactWrongPassword,
    'VALIDATION_FAILED' when error.fields.containsKey('newPassword') => l10n.passwordSameAsContact,
    'ACCOUNT_EXISTS' => l10n.contactTaken,
    'INVALID_STATE' => removing ? l10n.contactKeepOne : l10n.contactSame,
    'OTP_INVALID' ||
    'OTP_EXPIRED' ||
    'OTP_LOCKED' ||
    'OTP_SEND_LIMIT' ||
    'OTP_RESEND_TOO_SOON' ||
    'CHANNEL_UNAVAILABLE' => otpErrorText(context, error),
    _ => commonErrorText(context, error),
  };
}

/// Add or change the e-mail or the phone: new value + current password → code → confirmed.
class ContactEditScreen extends ConsumerStatefulWidget {
  const ContactEditScreen({required this.email, required this.exists, super.key});

  final bool email;
  final bool exists;

  @override
  ConsumerState<ContactEditScreen> createState() => _ContactEditScreenState();
}

class _ContactEditScreenState extends ConsumerState<ContactEditScreen> {
  final _value = TextEditingController();
  final _password = TextEditingController();
  final _code = TextEditingController();
  OtpChallengeDto? _challenge;
  bool _busy = false;
  ApiError? _error;

  @override
  void dispose() {
    _value.dispose();
    _password.dispose();
    _code.dispose();
    super.dispose();
  }

  bool get _valueValid {
    final text = _value.text.trim();
    return isValidIdentifier(text) && text.contains('@') == widget.email;
  }

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

  Future<void> _send() => _run(() async {
    final challenge = await ref
        .read(apiProvider)
        .account
        .accountSecurityControllerRequestContact(
          body: ContactRequestDto(
            identifier: _value.text.trim(),
            password: _password.text,
            language: ref.read(sessionControllerProvider.notifier).language(),
          ),
        );
    setState(() => _challenge = challenge);
  });

  Future<void> _confirm() => _run(() async {
    try {
      await ref
          .read(apiProvider)
          .account
          .accountSecurityControllerConfirmContact(
            body: ContactConfirmDto(challengeId: _challenge!.challengeId, code: _code.text),
          );
      if (mounted) context.pop(true);
    } catch (_) {
      _code.clear();
      rethrow;
    }
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final mode = '${widget.exists ? 'change' : 'add'}${widget.email ? 'Email' : 'Phone'}';
    final error = _error;
    final alert = error == null
        ? null
        : DtAlert(severity: DtAlertSeverity.critical, body: _contactErrorText(context, error));
    final challenge = _challenge;
    if (challenge != null) {
      return DtPage(
        title: l10n.contactTitle(mode),
        intro: l10n.otpSentTo(challenge.destinationHint),
        onBack: () => setState(() => _challenge = null),
        actions: [
          ?alert,
          DtButton(
            label: l10n.contactConfirm,
            loading: _busy,
            onPressed: _code.text.length == OtpCodeInput.length ? _confirm : null,
          ),
        ],
        children: [OtpCodeInput(controller: _code, hasError: error != null, onCompleted: (_) => setState(() {}))],
      );
    }
    return DtPage(
      title: l10n.contactTitle(mode),
      intro: l10n.contactIntro,
      actions: [
        ?alert,
        DtButton(
          label: l10n.contactSendCode,
          loading: _busy,
          onPressed: _valueValid && _password.text.isNotEmpty ? _send : null,
        ),
      ],
      children: [
        DtTextField(
          label: widget.email ? l10n.contactNewEmail : l10n.contactNewPhone,
          controller: _value,
          keyboardType: widget.email ? TextInputType.emailAddress : TextInputType.phone,
          autofillHints: [widget.email ? AutofillHints.email : AutofillHints.telephoneNumber],
          textInputAction: TextInputAction.next,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: DtSpace.s4),
        PasswordField(label: l10n.contactPassword, controller: _password, onChanged: (_) => setState(() {})),
      ],
    );
  }
}

/// « Changer le mot de passe »: current + new; other devices are signed out by the API.
class PasswordChangeScreen extends ConsumerStatefulWidget {
  const PasswordChangeScreen({super.key});

  @override
  ConsumerState<PasswordChangeScreen> createState() => _PasswordChangeScreenState();
}

class _PasswordChangeScreenState extends ConsumerState<PasswordChangeScreen> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  bool _busy = false;
  ApiError? _error;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(apiProvider)
          .account
          .accountSecurityControllerChangePassword(
            body: PasswordChangeDto(currentPassword: _current.text, newPassword: _next.text),
          );
      if (mounted) context.pop(true);
    } catch (error) {
      if (mounted) setState(() => _error = ApiError.from(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final error = _error;
    return DtPage(
      title: l10n.passwordTitle,
      actions: [
        if (error != null) DtAlert(severity: DtAlertSeverity.critical, body: _contactErrorText(context, error)),
        DtButton(
          label: l10n.passwordSave,
          loading: _busy,
          onPressed: _current.text.isNotEmpty && passwordStrength(_next.text) != PasswordStrength.tooShort
              ? _save
              : null,
        ),
      ],
      children: [
        PasswordField(label: l10n.passwordCurrent, controller: _current, onChanged: (_) => setState(() {})),
        const SizedBox(height: DtSpace.s4),
        PasswordField(
          label: l10n.passwordNew,
          controller: _next,
          showStrength: true,
          newPassword: true,
          onChanged: (_) => setState(() {}),
        ),
      ],
    );
  }
}
