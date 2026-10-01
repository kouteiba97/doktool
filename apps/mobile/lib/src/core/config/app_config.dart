/// Build-time configuration, passed with `--dart-define`.
///
/// ```sh
/// flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
/// flutter build apk --dart-define=API_BASE_URL=https://api.example.dz --dart-define=APP_VERSION=1.0.0+1
/// ```
abstract final class AppConfig {
  /// Base URL of the DokTool API (the Android emulator reaches the host at 10.0.2.2).
  static const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:3000');

  /// The release reported with analytics (e.g. `1.0.0+12`), set by the release build; none in
  /// development.
  static const String? appVersion = bool.hasEnvironment('APP_VERSION') ? String.fromEnvironment('APP_VERSION') : null;
}
