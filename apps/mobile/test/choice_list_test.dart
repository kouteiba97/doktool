// ADR-026: calculator answers are never cut. Short answers (up to four) stay a segmented control;
// long ones, or more than four, become full rows chosen in one tap, readable by screen readers.
import 'package:doktool/src/l10n/generated/app_localizations.dart';
import 'package:doktool/src/theme/doktool_tokens.dart';
import 'package:doktool/src/ui/choice_list.dart';
import 'package:doktool/src/ui/segmented_control.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/semantics_guidelines.dart';

const _long = [
  DtSegment(value: 'o1', label: '0 - Inférieur à 60 ans.'),
  DtSegment(value: 'o2', label: '1 - Supérieur ou égal à 60 ans.'),
];

Widget _app(Widget child, {double textScale = 1, Brightness brightness = Brightness.light}) => MaterialApp(
  theme: dtTheme(brightness),
  locale: const Locale('fr'),
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  home: MediaQuery(
    data: MediaQueryData(size: const Size(390, 844), textScaler: TextScaler.linear(textScale)),
    child: Scaffold(
      body: Padding(padding: const EdgeInsets.all(16), child: child),
    ),
  ),
);

/// The layout the calculator screen picks for these answers on a phone-width field.
Widget _picked(List<DtSegment<String>> segments, String? selected, ValueChanged<String> onChanged) => LayoutBuilder(
  builder: (context, constraints) => segmentsFit(context, [for (final s in segments) s.label], constraints.maxWidth)
      ? DtSegmentedControl<String?>(
          segments: [for (final s in segments) DtSegment<String?>(value: s.value, label: s.label)],
          selected: selected,
          onChanged: (value) => onChanged(value!),
          semanticLabel: 'Âge',
        )
      : DtChoiceList<String>(segments: segments, selected: selected, onChanged: onChanged, semanticLabel: 'Âge'),
);

void main() {
  testWidgets('long answers are shown whole as rows, and one tap chooses', (tester) async {
    String? chosen;
    await tester.pumpWidget(
      _app(StatefulBuilder(builder: (context, setState) => _picked(_long, chosen, (v) => setState(() => chosen = v)))),
    );
    expect(find.byType(DtChoiceList<String>), findsOneWidget);
    expect(find.byType(DtSegmentedControl<String?>), findsNothing);
    // The whole text is laid out, never ellipsised.
    for (final segment in _long) {
      final text = tester.widget<Text>(find.text(segment.label));
      expect(text.overflow, isNot(TextOverflow.ellipsis));
      expect(text.maxLines, isNull);
    }
    await tester.tap(find.text('1 - Supérieur ou égal à 60 ans.'));
    await tester.pumpAndSettle();
    expect(chosen, 'o2');
  });

  testWidgets('short answers stay a segmented control, unless the text is enlarged', (tester) async {
    const short = [DtSegment(value: 'o1', label: 'Non'), DtSegment(value: 'o2', label: 'Oui')];
    await tester.pumpWidget(_app(_picked(short, null, (_) {})));
    expect(find.byType(DtSegmentedControl<String?>), findsOneWidget);

    const four = [
      DtSegment(value: 'o1', label: 'Absent'),
      DtSegment(value: 'o2', label: 'Léger'),
      DtSegment(value: 'o3', label: 'Modéré'),
      DtSegment(value: 'o4', label: 'Sévère et persistant'),
    ];
    await tester.pumpWidget(_app(_picked(four, null, (_) {}), textScale: 2));
    expect(find.byType(DtChoiceList<String>), findsOneWidget);
  });

  testWidgets('more than four answers are always rows', (tester) async {
    final five = [for (var i = 0; i < 5; i++) DtSegment(value: 'o$i', label: '$i')];
    await tester.pumpWidget(_app(_picked(five, null, (_) {})));
    expect(find.byType(DtChoiceList<String>), findsOneWidget);
  });

  testWidgets('rows are a radio group for screen readers and meet the touch and contrast guidelines', (tester) async {
    final semantics = tester.ensureSemantics();
    for (final brightness in Brightness.values) {
      await tester.pumpWidget(
        _app(
          DtChoiceList<String>(segments: _long, selected: 'o2', onChanged: (_) {}, semanticLabel: 'Âge'),
          brightness: brightness,
        ),
      );
      expect(
        tester.getSemantics(find.text('1 - Supérieur ou égal à 60 ans.')),
        matchesSemantics(
          label: '1 - Supérieur ou égal à 60 ans.',
          isButton: true,
          isInMutuallyExclusiveGroup: true,
          hasCheckedState: true,
          isChecked: true,
          hasTapAction: true,
        ),
      );
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      await expectLater(tester, meetsGuideline(buttonsHaveTapAction));
    }
    semantics.dispose();
  });
}
