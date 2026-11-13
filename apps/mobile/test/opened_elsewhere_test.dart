// ADR-029: a phone signed out because its account was opened elsewhere says so on Welcome.
import 'package:doktool/src/app.dart';
import 'package:doktool/src/core/auth/session_controller.dart';
import 'package:doktool/src/core/database/app_database.dart';
import 'package:doktool/src/features/onboarding/welcome_screen.dart';
import 'package:doktool/src/router/app_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/test_app.dart';

void main() {
  late AppDatabase database;

  setUp(() => database = memoryDatabase());
  tearDown(() => database.close());

  Future<ProviderContainer> pumpWelcome(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...testOverrides(database: database),
          routerProvider.overrideWith((ref) => singleScreenRouter(const WelcomeScreen())),
        ],
        child: const DokToolApp(),
      ),
    );
    await tester.pumpAndSettle();
    return ProviderScope.containerOf(tester.element(find.byType(WelcomeScreen)));
  }

  testWidgets('Welcome is silent after an ordinary sign-out', (tester) async {
    await pumpWelcome(tester);
    expect(find.text('Compte ouvert sur un autre appareil'), findsNothing);
  });

  testWidgets('Welcome explains a sign-out caused by another device, within the guidelines', (tester) async {
    final semantics = tester.ensureSemantics();
    final container = await pumpWelcome(tester);
    container.read(openedElsewhereProvider.notifier).set(true);
    await tester.pumpAndSettle();

    expect(find.text('Compte ouvert sur un autre appareil'), findsOneWidget);
    expect(find.textContaining('un seul appareil à la fois'), findsOneWidget);
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
    semantics.dispose();
  });
}
