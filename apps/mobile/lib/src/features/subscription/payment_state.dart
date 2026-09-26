import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The checkout being paid on the provider's page (in memory only).
@immutable
class PendingCheckout {
  const PendingCheckout({required this.transactionId, required this.redirectUrl, required this.planId});

  final String transactionId;
  final String redirectUrl;
  final String planId;
}

class PendingCheckoutController extends Notifier<PendingCheckout?> {
  @override
  PendingCheckout? build() => null;

  void start(String transactionId, String redirectUrl, String planId) =>
      state = PendingCheckout(transactionId: transactionId, redirectUrl: redirectUrl, planId: planId);

  void clear() => state = null;
}

final pendingCheckoutProvider = NotifierProvider<PendingCheckoutController, PendingCheckout?>(
  PendingCheckoutController.new,
);
