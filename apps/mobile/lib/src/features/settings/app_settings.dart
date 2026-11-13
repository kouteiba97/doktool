import 'package:flutter/material.dart';

/// « Apparence »: Clair · Sombre · Appareil (section ScreenSettings).
enum AppearancePreference {
  light,
  dark,
  system;

  ThemeMode get themeMode => switch (this) {
    AppearancePreference.light => ThemeMode.light,
    AppearancePreference.dark => ThemeMode.dark,
    AppearancePreference.system => ThemeMode.system,
  };
}

/// Interface language (FR/EN only, no RTL — section 19). Reference PDFs keep their own language.
enum AppLanguage {
  fr,
  en;

  Locale get locale => Locale(name);

  /// French unless the device is set to English (DokTool is French-first).
  static AppLanguage fromDevice(Locale deviceLocale) =>
      deviceLocale.languageCode == 'en' ? AppLanguage.en : AppLanguage.fr;
}

/// The device settings: appearance (light, dark, system) and language.
@immutable
class AppSettings {
  const AppSettings({required this.appearance, required this.language});

  final AppearancePreference appearance;
  final AppLanguage language;

  /// A copy with some settings changed.
  AppSettings copyWith({AppearancePreference? appearance, AppLanguage? language}) =>
      AppSettings(appearance: appearance ?? this.appearance, language: language ?? this.language);

  @override
  bool operator ==(Object other) =>
      other is AppSettings && other.appearance == appearance && other.language == language;

  @override
  int get hashCode => Object.hash(appearance, language);
}
