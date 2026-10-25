import 'dart:async';

import 'package:flutter/material.dart';

import '../../l10n/generated/app_localizations.dart';
import '../../ui/dt_button.dart';

/// « Renvoyer dans 42 s », then « Renvoyer le code » once the server allows it (ADR-009: 60 s).
class ResendCodeButton extends StatefulWidget {
  const ResendCodeButton({required this.availableAt, required this.onResend, this.loading = false, super.key});

  final DateTime availableAt;
  final Future<void> Function() onResend;
  final bool loading;

  @override
  State<ResendCodeButton> createState() => _ResendCodeButtonState();
}

/// Redraws every second so the countdown moves.
class _ResendCodeButtonState extends State<ResendCodeButton> {
  Timer? _timer;

  /// Starts the one-second tick.
  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  /// Stops the tick.
  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final remaining = widget.availableAt.difference(DateTime.now()).inSeconds;
    final waiting = remaining > 0;
    // « Renvoyer le code », disabled with a countdown until it is allowed.
    return DtButton(
      label: waiting ? l10n.otpResendIn('$remaining') : l10n.otpResend,
      variant: DtButtonVariant.ghost,
      loading: widget.loading,
      onPressed: waiting ? null : widget.onResend,
    );
  }
}
