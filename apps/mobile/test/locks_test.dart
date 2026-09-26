// Locked items keep their place and explain the boundary; students never get a purchase action
// (Locks L38, L39).
import 'package:doktool/src/core/api/generated/models/access_state.dart';
import 'package:doktool/src/core/api/generated/models/item_access_dto.dart';
import 'package:doktool/src/core/api/generated/models/lock_reason.dart';
import 'package:doktool/src/core/api/generated/models/unlock_path.dart';
import 'package:doktool/src/l10n/generated/app_localizations.dart';
import 'package:doktool/src/theme/doktool_tokens.dart';
import 'package:doktool/src/ui/content_row.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

Widget _app(Widget child) => MaterialApp(
  theme: dtTheme(Brightness.light),
  locale: const Locale('fr'),
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  home: Scaffold(body: child),
);

ContentRow _row(ItemAccessDto access, {required VoidCallback onOpen}) => ContentRow(
  icon: LucideIcons.fileText,
  title: 'Arrêt de travail',
  access: access,
  actionLabel: 'Voir le modèle',
  onOpen: onOpen,
);

void main() {
  testWidgets('a locked row stays visible with its reason word and opens the calm sheet', (tester) async {
    var opened = false;
    await tester.pumpWidget(
      _app(
        _row(
          const ItemAccessDto(state: AccessState.locked, lockReason: LockReason.professionalOnly, unlockPath: null),
          onOpen: () => opened = true,
        ),
      ),
    );
    expect(find.text('Arrêt de travail'), findsOneWidget);
    expect(find.text('Médecins'), findsOneWidget);
    expect(find.text('Voir le modèle'), findsNothing);

    await tester.tap(find.text('Arrêt de travail'));
    await tester.pumpAndSettle();
    expect(opened, isFalse);
    expect(find.textContaining('réservé aux médecins'), findsOneWidget);
    expect(find.text('Voir les offres'), findsNothing);
    expect(find.text('Fermer'), findsOneWidget);
  });

  testWidgets('an unpaid professional is offered the plans', (tester) async {
    await tester.pumpWidget(
      _app(
        _row(
          const ItemAccessDto(
            state: AccessState.locked,
            lockReason: LockReason.subscriptionRequired,
            unlockPath: UnlockPath.subscriptionPlans,
          ),
          onOpen: () {},
        ),
      ),
    );
    expect(find.text('Pro'), findsOneWidget);
    await tester.tap(find.text('Arrêt de travail'));
    await tester.pumpAndSettle();
    expect(find.text('Voir les offres'), findsOneWidget);
  });

  testWidgets('an available row opens with its single action', (tester) async {
    var opened = false;
    await tester.pumpWidget(
      _app(
        _row(
          const ItemAccessDto(state: AccessState.available, lockReason: null, unlockPath: null),
          onOpen: () => opened = true,
        ),
      ),
    );
    expect(find.text('Voir le modèle'), findsOneWidget);
    await tester.tap(find.text('Arrêt de travail'));
    expect(opened, isTrue);
  });
}
