import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../core/api/generated/models/access_state.dart';
import '../core/api/generated/models/item_access_dto.dart';
import '../l10n/generated/app_localizations.dart';
import '../theme/doktool_tokens.dart';
import 'locks.dart';
import 'tokens.dart';

/// Title in the interface language, falling back to French (section 13).
String localizedTitle(BuildContext context, String fr, String? en) =>
    Localizations.localeOf(context).languageCode == 'en' && en != null && en.isNotEmpty ? en : fr;

/// A list row of the library, search and home: title, optional one line, and either the single
/// action (« Voir le modèle » / « Ouvrir ») or the lock with its reason word. A locked row keeps its
/// place and opens the lock sheet.
class ContentRow extends StatelessWidget {
  const ContentRow({
    required this.icon,
    required this.title,
    required this.access,
    required this.actionLabel,
    required this.onOpen,
    this.subtitle,
    this.highlight,
    this.detail,
    this.detailLabel,
    super.key,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final ItemAccessDto access;
  final String actionLabel;
  final VoidCallback onOpen;

  /// Query words to emphasise by weight, never by colour (section 12).
  final String? highlight;

  /// Extra line under the title (e.g. a period's conduct badge in « Grossesse » search).
  final Widget? detail;

  /// What [detail] says, read with the title (the row's semantics are merged into one label).
  final String? detailLabel;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final locked = access.state == AccessState.locked;
    final VoidCallback open = locked ? () => showLockSheet(context, access, title: title) : onOpen;
    return Semantics(
      button: true,
      label: locked
          ? '$title, ${lockWord(AppLocalizations.of(context), access.lockReason)}'
          : [title, ?detailLabel, actionLabel].join(', '),
      onTap: open,
      excludeSemantics: true,
      child: InkWell(
        onTap: open,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: DtSize.row),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: DtSpace.s4, vertical: DtSpace.s2),
            child: Row(
              children: [
                Icon(icon, size: DtSpace.s5, color: locked ? colors.inkMuted : colors.brand),
                const SizedBox(width: DtSpace.s3),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _Highlighted(
                        text: title,
                        query: highlight,
                        style: DtType.body.copyWith(color: locked ? colors.inkSecondary : colors.ink),
                      ),
                      if (subtitle != null && subtitle!.isNotEmpty)
                        Text(
                          subtitle!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: DtType.caption.copyWith(color: colors.inkMuted),
                        ),
                      if (detail != null && !locked) ...[const SizedBox(height: DtSpace.s1), detail!],
                    ],
                  ),
                ),
                const SizedBox(width: DtSpace.s2),
                if (locked)
                  LockLabel(reason: access.lockReason)
                else
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(actionLabel, style: DtType.label.copyWith(color: colors.brand)),
                      Icon(LucideIcons.chevronRight, size: DtSpace.s4, color: colors.brand),
                    ],
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A title with the searched letters in bold.
class _Highlighted extends StatelessWidget {
  const _Highlighted({required this.text, required this.style, this.query});

  final String text;
  final String? query;
  final TextStyle style;

  /// Lower case without accents, so « hepar » finds « Héparine ».
  static String _fold(String value) => value
      .toLowerCase()
      .replaceAll(RegExp('[àâäá]'), 'a')
      .replaceAll(RegExp('[éèêë]'), 'e')
      .replaceAll(RegExp('[îïí]'), 'i')
      .replaceAll(RegExp('[ôöó]'), 'o')
      .replaceAll(RegExp('[ùûüú]'), 'u')
      .replaceAll('ç', 'c');

  @override
  Widget build(BuildContext context) {
    final words = _fold(query ?? '').split(RegExp(r'[^a-z0-9]+')).where((word) => word.length > 1).toList();
    if (words.isEmpty) return Text(text, style: style);
    // Folding keeps lengths (one letter for one letter), so offsets map back to the original text.
    final folded = _fold(text);
    final marks = List<bool>.filled(text.length, false);
    for (final word in words) {
      var start = folded.indexOf(word);
      while (start >= 0) {
        for (var i = start; i < start + word.length && i < marks.length; i++) {
          marks[i] = true;
        }
        start = folded.indexOf(word, start + word.length);
      }
    }
    final spans = <TextSpan>[];
    var index = 0;
    while (index < text.length) {
      final bold = marks[index];
      var end = index;
      while (end < text.length && marks[end] == bold) {
        end++;
      }
      spans.add(
        TextSpan(
          text: text.substring(index, end),
          style: bold ? style.copyWith(fontWeight: FontWeight.w600) : null,
        ),
      );
      index = end;
    }
    return Text.rich(TextSpan(style: style, children: spans));
  }
}
