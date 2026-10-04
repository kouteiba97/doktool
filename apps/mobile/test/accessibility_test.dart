// Phase 18: WCAG 2.2 AA checks the framework can automate (section 20) — touch targets, labels on
// everything tappable, text contrast in both themes, and layouts that survive 200 % text.
import 'package:doktool/src/app.dart';
import 'package:doktool/src/core/database/app_database.dart';
import 'package:doktool/src/features/onboarding/demo_start_screen.dart';
import 'package:doktool/src/features/onboarding/password_reset_screens.dart';
import 'package:doktool/src/features/onboarding/role_select_screen.dart';
import 'package:doktool/src/features/onboarding/sign_in_screen.dart';
import 'package:doktool/src/features/onboarding/sign_up_screen.dart';
import 'package:doktool/src/features/onboarding/welcome_screen.dart';
import 'package:doktool/src/features/recovery/access_help_screen.dart';
import 'package:doktool/src/features/recovery/recovery_screen.dart';
import 'package:doktool/src/features/settings/account_security_screen.dart';
import 'package:doktool/src/features/settings/app_settings.dart';
import 'package:doktool/src/features/settings/delete_account_screen.dart';
import 'package:doktool/src/features/settings/settings_screen.dart';
import 'package:doktool/src/router/app_router.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/test_app.dart';

void main() {
  late AppDatabase database;

  setUp(() => database = memoryDatabase());
  tearDown(() => database.close());

  final screens = <String, Widget Function()>{
    'Welcome': WelcomeScreen.new,
    'Demo start': DemoStartScreen.new,
    'Sign-in': SignInScreen.new,
    'Sign-up': SignUpScreen.new,
    'Role': RoleSelectScreen.new,
    'Password reset': ResetRequestScreen.new,
    'Settings': SettingsScreen.new,
    'Delete account': DeleteAccountScreen.new,
    'Access help': AccessHelpScreen.new,
    'Account recovery': RecoveryScreen.new,
    'Change password': PasswordChangeScreen.new,
  };

  Future<void> pump(WidgetTester tester, Widget screen, {required AppearancePreference appearance}) async {
    await database.writeSetting('appearance', appearance.name);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...testOverrides(database: database),
          routerProvider.overrideWith((ref) => singleScreenRouter(screen)),
        ],
        child: const DokToolApp(),
      ),
    );
    await tester.pumpAndSettle();
  }

  for (final MapEntry(key: name, value: build) in screens.entries) {
    for (final appearance in [AppearancePreference.light, AppearancePreference.dark]) {
      testWidgets('$name (${appearance.name}) meets the touch, label and contrast guidelines', (tester) async {
        final semantics = tester.ensureSemantics();
        await pump(tester, build(), appearance: appearance);
        // The design system's floor is 44 × 44 (DtSize.touchMin, section 20) — above the 24 × 24 of
        // WCAG 2.2 AA (2.5.8); Material's 48 dp recommendation is not the DokTool rule.
        await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
        await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
        await expectLater(tester, meetsGuideline(textContrastGuideline));
        semantics.dispose();
      });
    }

    testWidgets('$name keeps its layout at 200 % text', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await pump(tester, build(), appearance: AppearancePreference.light);
      expect(tester.takeException(), isNull);
    });
  }
}
