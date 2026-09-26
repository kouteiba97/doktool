/// Build-time configuration, passed with `--dart-define`.
///
/// ```sh
/// flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
/// ```
abstract final class AppConfig {
  /// Base URL of the DokTool API (the Android emulator reaches the host at 10.0.2.2).
  static const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:3000');
}
