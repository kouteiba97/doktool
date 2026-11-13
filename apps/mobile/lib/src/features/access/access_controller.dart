import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/generated/models/access_profile_dto.dart';
import '../../core/api/generated/models/feature_decision_dto.dart';
import '../../core/api/generated/models/feature_key.dart';
import '../../core/auth/session.dart';
import '../../core/auth/session_controller.dart';

/// The backend's AccessProfile for this viewer (section 27). The app renders locks from it and
/// never re-derives access from the professional type (Lock L34). Refreshed on launch, on resume
/// and after verification or purchase events.
class AccessController extends AsyncNotifier<AccessProfileDto?> {
  /// Fetches GET /v1/me/access for the current session (null when signed out).
  @override
  Future<AccessProfileDto?> build() async {
    final session = ref.watch(sessionControllerProvider).value;
    if (session == null || session is SignedOut) return null;
    return ref.read(apiProvider).access.accessControllerMe();
  }

  /// Fetches the profile again (after verification, purchase, resume).
  Future<void> reload() async {
    ref.invalidateSelf();
    await future;
  }
}

final accessControllerProvider = AsyncNotifierProvider<AccessController, AccessProfileDto?>(AccessController.new);

/// Helpers on the access profile.
extension AccessProfileX on AccessProfileDto {
  /// The decision (available or locked, with reason) for one feature, if the profile lists it.
  FeatureDecisionDto? feature(FeatureKey key) => features.where((feature) => feature.key == key).firstOrNull;
}
