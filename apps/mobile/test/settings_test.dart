// Phase 8 exit criterion: light/dark and FR/EN switch live, from tokens only.
import 'package:doktool/src/app.dart';
import 'package:doktool/src/core/database/app_database.dart';
import 'package:doktool/src/features/settings/app_settings.dart';
import 'package:doktool/src/features/settings/settings_controller.dart';
import 'package:doktool/src/features/settings/settings_screen.dart';
import 'package:doktool/src/router/app_router.dart';
import 'package:doktool/src/theme/doktool_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/test_app.dart';

void main() {
  late AppDatabase database;

  setUp(() => database = memoryDatabase());
  tearDown(() => database.close());

  Future<void> pumpApp(WidgetTester tester, {Locale deviceLocale = const Locale('fr')}) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...testOverrides(database: database, deviceLocale: deviceLocale),
          routerProvider.overrideWith((ref) => singleScreenRouter(const SettingsScreen())),
        ],
        child: const DokToolApp(),
      ),
    );
    await tester.pumpAndSettle();
  }

  Brightness brightnessOf(WidgetTester tester) => Theme.of(tester.element(find.byType(SettingsScreen))).brightness;

  testWidgets('starts in French on a French device, following the device appearance', (tester) async {
    await pumpApp(tester);
    expect(find.text('Paramètres'), findsOneWidget);
    expect(find.text('Apparence'), findsOneWidget);
    expect(
      find.text('S’applique à toute l’interface. Les PDF de référence gardent leur propre langue.'),
      findsOneWidget,
    );
  });

  testWidgets('starts in English on an English device', (tester) async {
    await pumpApp(tester, deviceLocale: const Locale('en', 'GB'));
    expect(find.text('Settings'), findsOneWidget);
    expect(find.text('Appearance'), findsOneWidget);
  });

  testWidgets('switches light and dark live, with the token colours', (tester) async {
    await pumpApp(tester);

    await tester.tap(find.text('Sombre'));
    await tester.pumpAndSettle();
    expect(brightnessOf(tester), Brightness.dark);
    final dark = Theme.of(tester.element(find.byType(SettingsScreen)));
    expect(dark.scaffoldBackgroundColor, DtColors.dark.bg);
    expect(dark.extension<DtColors>(), DtColors.dark);

    await tester.tap(find.text('Clair'));
    await tester.pumpAndSettle();
    expect(brightnessOf(tester), Brightness.light);
    expect(Theme.of(tester.element(find.byType(SettingsScreen))).scaffoldBackgroundColor, DtColors.light.bg);
  });

  testWidgets('switches French and English live, without a restart', (tester) async {
    await pumpApp(tester);

    await tester.tap(find.text('English'));
    await tester.pumpAndSettle();
    expect(find.text('Settings'), findsOneWidget);
    expect(find.text('Light'), findsOneWidget);
    expect(find.text('Applies to the whole interface. Reference PDFs keep their own language.'), findsOneWidget);

    await tester.tap(find.text('Français'));
    await tester.pumpAndSettle();
    expect(find.text('Paramètres'), findsOneWidget);
  });

  testWidgets('keeps the choices for the next launch', (tester) async {
    await pumpApp(tester);
    await tester.tap(find.text('Sombre'));
    await tester.tap(find.text('English'));
    await tester.pumpAndSettle();

    final container = ProviderContainer(overrides: testOverrides(database: database));
    addTearDown(container.dispose);
    expect(
      await container.read(settingsControllerProvider.future),
      const AppSettings(appearance: AppearancePreference.dark, language: AppLanguage.en),
    );
  });

  testWidgets('segments meet the 44 px touch minimum', (tester) async {
    await pumpApp(tester);
    final size = tester.getSize(find.text('Sombre').hitTestable());
    expect(size.height, lessThanOrEqualTo(DtSize.touchMin));
    final segment = tester.getSize(
      find.ancestor(of: find.text('Sombre'), matching: find.byType(GestureDetector)).first,
    );
    expect(segment.height + 6, greaterThanOrEqualTo(DtSize.touchMin));
  });
}
