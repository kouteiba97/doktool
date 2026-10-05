// The shared controls a screen reader must be able to activate (TalkBack audit of 5 October 2026):
// each wraps an InkWell in its own Semantics, so each must give the tap action itself.
import 'package:doktool/src/core/api/generated/models/access_state.dart';
import 'package:doktool/src/core/api/generated/models/item_access_dto.dart';
import 'package:doktool/src/l10n/generated/app_localizations.dart';
import 'package:doktool/src/theme/doktool_tokens.dart';
import 'package:doktool/src/ui/content_row.dart';
import 'package:doktool/src/ui/dt_picker.dart';
import 'package:doktool/src/ui/dt_text_field.dart';
import 'package:doktool/src/ui/glass.dart';
import 'package:doktool/src/ui/pill_tabs.dart';
import 'package:doktool/src/ui/segmented_control.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import 'support/semantics_guidelines.dart';

void main() {
  testWidgets('glass buttons, rows, pickers, tabs and fields can be used with TalkBack', (tester) async {
    final semantics = tester.ensureSemantics();
    final taps = <String>[];
    final controller = TextEditingController();
    addTearDown(controller.dispose);
    await tester.pumpWidget(
      MaterialApp(
        theme: dtTheme(Brightness.light),
        locale: const Locale('fr'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: ListView(
            children: [
              DtGlassIconButton(icon: LucideIcons.arrowLeft, tooltip: 'Retour', onPressed: () => taps.add('back')),
              ContentRow(
                icon: LucideIcons.fileText,
                title: 'Angine aiguë de l’adulte',
                access: const ItemAccessDto(state: AccessState.available, lockReason: null, unlockPath: null),
                actionLabel: 'Ouvrir',
                onOpen: () => taps.add('row'),
              ),
              DtPickerField<String>(
                label: 'Spécialité',
                placeholder: 'Choisir',
                options: const [DtPickerOption(value: 'CARDIO', label: 'Cardiologie')],
                selected: null,
                onSelected: (_) {},
              ),
              DtPillTabs<int>(
                tabs: const [
                  DtPillTab(value: 0, label: 'Tous'),
                  DtPillTab(value: 1, label: 'Favoris'),
                ],
                selected: 0,
                onChanged: (value) => taps.add('tab $value'),
                semanticLabel: 'Filtre',
              ),
              DtSegmentedControl<String>(
                segments: const [
                  DtSegment(value: 'recent', label: 'Récents'),
                  DtSegment(value: 'fav', label: 'Favoris'),
                ],
                selected: 'recent',
                onChanged: (value) => taps.add('segment $value'),
              ),
              DtTextField(label: 'E-mail', controller: controller),
            ],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await expectLater(tester, meetsGuideline(buttonsHaveTapAction));
    await expectLater(tester, meetsGuideline(textFieldsAreLabelled));

    // The action reaches the same callback as a finger tap.
    for (final label in ['Retour', 'Angine aiguë de l’adulte, Ouvrir', 'Favoris']) {
      final node = tester.getSemantics(find.bySemanticsLabel(label).first);
      node.owner!.performAction(node.id, SemanticsAction.tap);
      await tester.pump();
    }
    final segment = tester.getSemantics(find.bySemanticsLabel('Favoris').last);
    segment.owner!.performAction(segment.id, SemanticsAction.tap);
    await tester.pump();
    expect(taps, ['back', 'row', 'tab 1', 'segment fav']);
    expect(tester.getSemantics(find.bySemanticsLabel('E-mail')).getSemanticsData().flagsCollection.isTextField, isTrue);
    semantics.dispose();
  });
}
