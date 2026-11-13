import 'dart:ui' show PlatformDispatcher;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/database/app_database.dart';
import 'app_settings.dart';

/// The device locale; overridden in tests.
final deviceLocaleProvider = Provider((ref) => PlatformDispatcher.instance.locale);

/// Appearance and language, stored on the device and applied instantly without restart
/// (ScreenSettings, LanguageSwitch). A failed save reverts the value and rethrows.
class SettingsController extends AsyncNotifier<AppSettings> {
  static const _appearanceKey = 'appearance';
  static const _languageKey = 'language';

  /// Preferences of the device, not of an account: they survive an account deletion.
  static const deviceKeys = {_appearanceKey, _languageKey};

  AppDatabase get _database => ref.read(appDatabaseProvider);

  /// Reads appearance and language from the device (system and French by default).
  @override
  Future<AppSettings> build() async {
    final database = ref.watch(appDatabaseProvider);
    final appearance = await database.readSetting(_appearanceKey);
    final language = await database.readSetting(_languageKey);
    return AppSettings(
      appearance: AppearancePreference.values.asNameMap()[appearance] ?? AppearancePreference.system,
      language: AppLanguage.values.asNameMap()[language] ?? AppLanguage.fromDevice(ref.watch(deviceLocaleProvider)),
    );
  }

  /// Changes the appearance.
  Future<void> setAppearance(AppearancePreference appearance) =>
      _update((s) => s.copyWith(appearance: appearance), _appearanceKey, appearance.name);

  /// Changes the language of the app.
  Future<void> setLanguage(AppLanguage language) =>
      _update((s) => s.copyWith(language: language), _languageKey, language.name);

  /// Applies a change at once, then saves it; goes back if saving fails.
  Future<void> _update(AppSettings Function(AppSettings) change, String key, String value) async {
    final previous = await future;
    state = AsyncData(change(previous));
    try {
      await _database.writeSetting(key, value);
    } catch (_) {
      state = AsyncData(previous);
      rethrow;
    }
  }
}

final settingsControllerProvider = AsyncNotifierProvider<SettingsController, AppSettings>(SettingsController.new);
