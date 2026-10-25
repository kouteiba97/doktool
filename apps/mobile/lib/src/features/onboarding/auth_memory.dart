import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/database/app_database.dart';

const _lastIdentifierKey = 'auth.last_identifier';

/// The identifier last used to sign in on this device (ScreenWelcome « returning device »: sign-in
/// becomes the primary action and the field is prefilled). No password is ever stored.
final lastIdentifierProvider = FutureProvider<String?>(
  (ref) => ref.watch(appDatabaseProvider).readSetting(_lastIdentifierKey),
);

/// Remembers the e-mail or phone last used, to pre-fill sign-in.
Future<void> rememberIdentifier(WidgetRef ref, String identifier) async {
  await ref.read(appDatabaseProvider).writeSetting(_lastIdentifierKey, identifier);
  ref.invalidate(lastIdentifierProvider);
}
