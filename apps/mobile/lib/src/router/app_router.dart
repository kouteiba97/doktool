import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/settings/settings_screen.dart';

/// Route map of audit §11. Routes join with the phase that builds their screen; the initial
/// location becomes `/welcome` with sign-in (Phase 9). Guards will read the AccessProfile and
/// render locked states — never hide a route the backend marked LOCKED.
abstract final class Routes {
  static const settings = '/settings';
}

final routerProvider = Provider<GoRouter>((ref) {
  final router = GoRouter(
    initialLocation: Routes.settings,
    routes: [
      GoRoute(path: Routes.settings, builder: (context, state) => const SettingsScreen()),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});
