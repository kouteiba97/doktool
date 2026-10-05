import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../l10n/generated/app_localizations.dart';
import '../../ui/dt_text_field.dart';
import '../../ui/tokens.dart';
import 'validators.dart';

/// Password input with a show/hide control and, for new passwords, the strength line.
class PasswordField extends StatefulWidget {
  const PasswordField({
    required this.label,
    required this.controller,
    this.focusNode,
    this.error,
    this.showStrength = false,
    this.newPassword = false,
    this.onChanged,
    this.onSubmitted,
    super.key,
  });

  final String label;
  final TextEditingController controller;
  final FocusNode? focusNode;
  final String? error;
  final bool showStrength;
  final bool newPassword;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;

  @override
  State<PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<PasswordField> {
  bool _visible = false;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    String? helper;
    if (widget.showStrength && widget.controller.text.isNotEmpty) {
      helper = switch (passwordStrength(widget.controller.text)) {
        PasswordStrength.tooShort => l10n.signUpPasswordTooShort,
        PasswordStrength.weak => l10n.signUpPasswordWeak,
        PasswordStrength.fair => l10n.signUpPasswordFair,
        PasswordStrength.strong => l10n.signUpPasswordStrong,
      };
    }
    return DtTextField(
      label: widget.label,
      controller: widget.controller,
      focusNode: widget.focusNode,
      obscureText: !_visible,
      keyboardType: TextInputType.visiblePassword,
      autofillHints: [widget.newPassword ? AutofillHints.newPassword : AutofillHints.password],
      textInputAction: TextInputAction.done,
      maxLength: 128,
      error: widget.error,
      helper: helper,
      onChanged: widget.onChanged,
      onSubmitted: widget.onSubmitted,
      trailing: IconButton(
        tooltip: _visible ? l10n.commonHidePassword : l10n.commonShowPassword,
        icon: Icon(_visible ? LucideIcons.eyeOff : LucideIcons.eye, color: colors.inkMuted),
        onPressed: () => setState(() => _visible = !_visible),
      ),
    );
  }
}
