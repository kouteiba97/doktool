import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../theme/doktool_tokens.dart';
import 'tokens.dart';

/// Text field of the Input component: label above, 48 px well on mobile, helper line that becomes
/// the error message (with an icon, never colour alone). Validation is shown on blur or submit —
/// the caller passes [error] only then.
class DtTextField extends StatelessWidget {
  const DtTextField({
    required this.label,
    required this.controller,
    this.helper,
    this.error,
    this.requiredMark,
    this.keyboardType,
    this.textInputAction,
    this.autofillHints,
    this.obscureText = false,
    this.enabled = true,
    this.focusNode,
    this.onChanged,
    this.onSubmitted,
    this.onEditingComplete,
    this.inputFormatters,
    this.textCapitalization = TextCapitalization.none,
    this.trailing,
    this.maxLength,
    super.key,
  });

  final String label;
  final TextEditingController controller;
  final String? helper;
  final String? error;

  /// Words shown after the label, e.g. « requis ».
  final String? requiredMark;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final Iterable<String>? autofillHints;
  final bool obscureText;
  final bool enabled;
  final FocusNode? focusNode;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final VoidCallback? onEditingComplete;
  final List<TextInputFormatter>? inputFormatters;
  final TextCapitalization textCapitalization;
  final Widget? trailing;
  final int? maxLength;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final hasError = error != null;
    OutlineInputBorder border(Color color, double width) => OutlineInputBorder(
      borderRadius: BorderRadius.circular(DtRadius.md),
      borderSide: BorderSide(color: color, width: width),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Read as the field's own label below, not as a separate line.
        ExcludeSemantics(
          child: Text.rich(
            TextSpan(
              text: label,
              children: [
                if (requiredMark != null)
                  TextSpan(
                    text: ' · $requiredMark',
                    style: DtType.caption.copyWith(color: colors.inkMuted),
                  ),
              ],
            ),
            style: DtType.label.copyWith(color: colors.inkSecondary),
          ),
        ),
        const SizedBox(height: DtSpace.s1),
        Semantics(
          label: requiredMark == null ? label : '$label, $requiredMark',
          child: TextField(
            controller: controller,
            focusNode: focusNode,
            enabled: enabled,
            obscureText: obscureText,
            keyboardType: keyboardType,
            textInputAction: textInputAction,
            autofillHints: autofillHints,
            onChanged: onChanged,
            onSubmitted: onSubmitted,
            onEditingComplete: onEditingComplete,
            inputFormatters: inputFormatters,
            textCapitalization: textCapitalization,
            maxLength: maxLength,
            style: DtType.body.copyWith(color: colors.ink),
            cursorColor: colors.brand,
            decoration: InputDecoration(
              isDense: true,
              counterText: '',
              filled: true,
              fillColor: colors.surface,
              constraints: const BoxConstraints(minHeight: DtSize.controlLg),
              contentPadding: const EdgeInsets.symmetric(horizontal: DtSpace.s3, vertical: DtSpace.s3),
              suffixIcon: trailing,
              enabledBorder: border(
                hasError ? colors.critical : colors.borderStrong,
                hasError ? DtBorder.focus : DtBorder.control,
              ),
              focusedBorder: border(hasError ? colors.critical : colors.focus, DtBorder.focus),
              disabledBorder: border(colors.border, DtBorder.control),
            ),
          ),
        ),
        if (hasError || helper != null) ...[
          const SizedBox(height: DtSpace.s1),
          Semantics(
            liveRegion: hasError,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (hasError) ...[
                  Icon(LucideIcons.circleAlert, size: DtSpace.s4, color: colors.critical),
                  const SizedBox(width: DtSpace.s1),
                ],
                Expanded(
                  child: Text(
                    error ?? helper!,
                    style: DtType.caption.copyWith(color: hasError ? colors.critical : colors.inkMuted),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
