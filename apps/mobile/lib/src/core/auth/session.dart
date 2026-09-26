import '../api/generated/models/demo_context.dart';

/// Who is using the app on this device (ADR-009, ADR-010).
sealed class Session {
  const Session();
}

/// Nobody signed in: Welcome, sign-in, sign-up and the demo entry only.
final class SignedOut extends Session {
  const SignedOut();
}

/// A real account. Its refresh token lives in the Keychain / Keystore.
final class UserSession extends Session {
  const UserSession({required this.sessionId});

  final String sessionId;
}

/// A demo access context (section 27): no account, read endpoints only.
final class DemoSession extends Session {
  const DemoSession({required this.demoSessionId, required this.demoContext});

  final String demoSessionId;
  final DemoContext demoContext;
}
