import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../l10n/generated/app_localizations.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/tokens.dart';

/// Six boxes over one hidden field, so paste and SMS / e-mail code autofill work (ScreenAccountCreate
/// OTP state). [onCompleted] fires when the sixth digit is entered.
class OtpCodeInput extends StatefulWidget {
  const OtpCodeInput({
    required this.controller,
    required this.onCompleted,
    this.hasError = false,
    this.enabled = true,
    super.key,
  });

  static const length = 6;

  final TextEditingController controller;
  final ValueChanged<String> onCompleted;
  final bool hasError;
  final bool enabled;

  @override
  State<OtpCodeInput> createState() => _OtpCodeInputState();
}

/// The six boxes redraw when the hidden field gains or loses focus.
class _OtpCodeInputState extends State<OtpCodeInput> {
  final _focus = FocusNode();

  /// Redraws the boxes on focus changes.
  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() {}));
  }

  /// Frees the focus node.
  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final l10n = AppLocalizations.of(context);
    final code = widget.controller.text;
    return Stack(
      children: [
        Row(
          children: [
            for (var index = 0; index < OtpCodeInput.length; index++) ...[
              if (index > 0) const SizedBox(width: DtSpace.s2),
              Expanded(
                child: ExcludeSemantics(
                  child: Container(
                    height: DtSize.controlLg + DtSpace.s2,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: colors.surface,
                      borderRadius: BorderRadius.circular(DtRadius.md),
                      border: Border.all(
                        color: widget.hasError
                            ? colors.critical
                            : _focus.hasFocus && index == code.length.clamp(0, OtpCodeInput.length - 1)
                            ? colors.focus
                            : colors.borderStrong,
                        width: widget.hasError || (_focus.hasFocus && index == code.length)
                            ? DtBorder.focus
                            : DtBorder.control,
                      ),
                    ),
                    child: Text(
                      index < code.length ? code[index] : '',
                      style: DtType.title.copyWith(
                        color: colors.ink,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
        Positioned.fill(
          child: Opacity(
            opacity: 0,
            child: TextField(
              controller: widget.controller,
              focusNode: _focus,
              enabled: widget.enabled,
              autofocus: true,
              keyboardType: TextInputType.number,
              autofillHints: const [AutofillHints.oneTimeCode],
              maxLength: OtpCodeInput.length,
              showCursor: false,
              enableInteractiveSelection: true,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: InputDecoration(
                counterText: '',
                border: InputBorder.none,
                semanticCounterText: l10n.otpDigitLabel('${code.length}'),
              ),
              onChanged: (value) {
                setState(() {});
                if (value.length == OtpCodeInput.length) widget.onCompleted(value);
              },
            ),
          ),
        ),
      ],
    );
  }
}
