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

/// The payment started in the browser, in memory until its result is known.
class PendingCheckoutController extends Notifier<PendingCheckout?> {
  /// No payment pending at launch.
  @override
  PendingCheckout? build() => null;

  /// A payment was started: remembers it while the person is on the payment page.
  void start(String transactionId, String redirectUrl, String planId) =>
      state = PendingCheckout(transactionId: transactionId, redirectUrl: redirectUrl, planId: planId);

  /// The payment is over.
  void clear() => state = null;
}

final pendingCheckoutProvider = NotifierProvider<PendingCheckoutController, PendingCheckout?>(
  PendingCheckoutController.new,
);
