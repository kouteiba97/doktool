// Home « Récents » and the history screen name what was opened from the server's own entries:
// the app must not download whole lists (the « Grossesse · Allaitement » list is thousands of
// rows) to show at most five titles.
import 'package:doktool/src/core/api/generated/models/access_state.dart';
import 'package:doktool/src/core/api/generated/models/activity_dto.dart';
import 'package:doktool/src/core/api/generated/models/activity_kind.dart';
import 'package:doktool/src/core/api/generated/models/favorite_item_dto.dart';
import 'package:doktool/src/core/api/generated/models/favorite_item_dto_kind.dart';
import 'package:doktool/src/core/api/generated/models/item_access_dto.dart';
import 'package:doktool/src/core/api/generated/models/lock_reason.dart';
import 'package:doktool/src/core/api/generated/models/reference_document_type.dart';
import 'package:doktool/src/features/activity/activity_data.dart';
import 'package:doktool/src/features/library/library_data.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

const _open = ItemAccessDto(state: AccessState.available, lockReason: null, unlockPath: null);
const _locked = ItemAccessDto(state: AccessState.locked, lockReason: LockReason.professionalOnly, unlockPath: null);

FavoriteItemDto _item(FavoriteItemDtoKind kind, String title, {String? slug, ItemAccessDto access = _open}) =>
    FavoriteItemDto(access: access, kind: kind, titleFr: title, titleEn: '$title (en)', slug: slug);

ActivityDto _entry(int minute, ActivityKind kind, {String? targetId, FavoriteItemDto? item, String? query}) =>
    ActivityDto(
      id: 'entry-$minute',
      kind: kind,
      occurredAt: DateTime.utc(2026, 11, 11, 10, minute),
      targetId: targetId,
      item: item,
      queryText: query,
    );

void main() {
  group('ContentRef.fromItem', () {
    test('keeps the title, the access and how each kind opens', () {
      final calculator = ContentRef.fromItem('c1', _item(FavoriteItemDtoKind.calculator, 'IMC', slug: 'bmi'))!;
      expect(calculator.isCalculator, isTrue);
      expect(calculator.slug, 'bmi');
      expect(calculator.titleEn, 'IMC (en)');

      final certificate = ContentRef.fromItem(
        'r1',
        _item(FavoriteItemDtoKind.certificate, 'Aptitude', access: _locked),
      )!;
      expect(certificate.referenceType, ReferenceDocumentType.certificate);
      expect(certificate.access.state, AccessState.locked);
      expect(certificate.opens, isFalse);

      final substance = ContentRef.fromItem('s1', _item(FavoriteItemDtoKind.substance, 'Ibuprofène'))!;
      expect(substance.isSubstance, isTrue);
      expect(substance.isCalculator, isFalse);
      expect(substance.opens, isTrue);
    });

    test('ignores a kind this version of the app does not know', () {
      expect(ContentRef.fromItem('x', _item(FavoriteItemDtoKind.$unknown, 'Nouveau')), isNull);
    });
  });

  test('« Récents » come from the history alone: five distinct items, searches and gone items left out', () async {
    var listsRead = 0;
    final container = ProviderContainer(
      overrides: [
        activityHistoryProvider(null).overrideWith(
          (ref) async => [
            _entry(9, ActivityKind.search, query: 'clairance'),
            _entry(
              8,
              ActivityKind.pregnancyView,
              targetId: 's1',
              item: _item(FavoriteItemDtoKind.substance, 'Ibuprofène'),
            ),
            _entry(
              7,
              ActivityKind.calculatorUse,
              targetId: 'c1',
              item: _item(FavoriteItemDtoKind.calculator, 'IMC', slug: 'bmi'),
            ),
            _entry(
              6,
              ActivityKind.pregnancyView,
              targetId: 's1',
              item: _item(FavoriteItemDtoKind.substance, 'Ibuprofène'),
            ),
            _entry(5, ActivityKind.referenceView, targetId: 'gone'),
            for (var n = 0; n < 6; n++)
              _entry(
                4 - n ~/ 2,
                ActivityKind.referenceView,
                targetId: 'r$n',
                item: _item(FavoriteItemDtoKind.ordonnance, 'Modèle $n'),
              ),
          ],
        ),
        // Any list read would be a regression: these must stay untouched.
        calculatorListProvider.overrideWith((ref) async {
          listsRead++;
          return const [];
        }),
        referenceListProvider.overrideWith((ref, type) async {
          listsRead++;
          return const [];
        }),
      ],
    );
    addTearDown(container.dispose);

    final recents = await container.read(recentContentProvider.future);
    expect(recents.map((content) => content.id), ['s1', 'c1', 'r0', 'r1', 'r2']);
    expect(recents.first.isSubstance, isTrue);
    expect(listsRead, 0);
  });
}
