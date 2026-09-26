import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'features/settings/app_settings.dart';
import 'features/settings/settings_controller.dart';
import 'l10n/generated/app_localizations.dart';
import 'router/app_router.dart';
import 'theme/doktool_tokens.dart';

/// Root widget: light and dark themes from the tokens, FR/EN from packages/i18n, both switched
/// live from Settings.
class DokToolApp extends ConsumerWidget {
  const DokToolApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings =
        ref.watch(settingsControllerProvider).value ??
        AppSettings(
          appearance: AppearancePreference.system,
          language: AppLanguage.fromDevice(ref.watch(deviceLocaleProvider)),
        );
    return MaterialApp.router(
      routerConfig: ref.watch(routerProvider),
      onGenerateTitle: (context) => AppLocalizations.of(context).appName,
      theme: dtTheme(Brightness.light),
      darkTheme: dtTheme(Brightness.dark),
      themeMode: settings.appearance.themeMode,
      locale: settings.language.locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      debugShowCheckedModeBanner: false,
    );
  }
}
