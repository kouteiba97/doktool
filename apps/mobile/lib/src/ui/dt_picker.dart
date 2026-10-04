import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../l10n/generated/app_localizations.dart';
import '../theme/doktool_tokens.dart';
import 'tokens.dart';

/// One option of a [DtPickerField].
class DtPickerOption<T> {
  const DtPickerOption({required this.value, required this.label, this.detail});

  final T value;
  final String label;
  final String? detail;
}

/// A picker (never typed free text, section 06): a field that opens a searchable bottom sheet.
class DtPickerField<T> extends StatelessWidget {
  const DtPickerField({
    required this.label,
    required this.placeholder,
    required this.options,
    required this.selected,
    required this.onSelected,
    this.requiredMark,
    this.error,
    this.emptyMessage,
    this.searchable = true,
    super.key,
  });

  final String label;
  final String placeholder;
  final List<DtPickerOption<T>> options;
  final T? selected;
  final ValueChanged<T> onSelected;
  final String? requiredMark;
  final String? error;
  final String? emptyMessage;
  final bool searchable;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final current = options.where((option) => option.value == selected).firstOrNull;
    final hasError = error != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text.rich(
          TextSpan(
            text: label,
            children: [
              if (requiredMark != null)
                TextSpan(
                  text: ' · $requiredMark',
                  style: DtType.caption.copyWith(color: colors.inkMuted),
                ),
            ],
          ),
          style: DtType.label.copyWith(color: colors.inkSecondary),
        ),
        const SizedBox(height: DtSpace.s1),
        Semantics(
          button: true,
          label: '$label, ${current?.label ?? placeholder}',
          excludeSemantics: true,
          child: Material(
            color: colors.surface,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(DtRadius.md),
              side: BorderSide(
                color: hasError ? colors.critical : colors.borderStrong,
                width: hasError ? DtBorder.focus : DtBorder.control,
              ),
            ),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: () async {
                final picked = await showModalBottomSheet<T>(
                  // Above the floating tab bar (ADR-020), never under it.
                  useRootNavigator: true,
                  context: context,
                  isScrollControlled: true,
                  useSafeArea: true,
                  backgroundColor: colors.surface,
                  shape: const RoundedRectangleBorder(
                    borderRadius: BorderRadius.vertical(top: Radius.circular(DtRadius.xl)),
                  ),
                  builder: (context) => _PickerSheet<T>(
                    title: label,
                    options: options,
                    selected: selected,
                    searchable: searchable,
                    emptyMessage: emptyMessage,
                  ),
                );
                if (picked != null) onSelected(picked);
              },
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: DtSize.controlLg),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: DtSpace.s3),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          current?.label ?? placeholder,
                          style: DtType.body.copyWith(color: current == null ? colors.inkMuted : colors.ink),
                        ),
                      ),
                      Icon(LucideIcons.chevronDown, size: DtSpace.s5, color: colors.inkMuted),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        if (hasError) ...[
          const SizedBox(height: DtSpace.s1),
          Row(
            children: [
              Icon(LucideIcons.circleAlert, size: DtSpace.s4, color: colors.critical),
              const SizedBox(width: DtSpace.s1),
              Expanded(
                child: Text(error!, style: DtType.caption.copyWith(color: colors.critical)),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

class _PickerSheet<T> extends StatefulWidget {
  const _PickerSheet({
    required this.title,
    required this.options,
    required this.selected,
    required this.searchable,
    this.emptyMessage,
  });

  final String title;
  final List<DtPickerOption<T>> options;
  final T? selected;
  final bool searchable;
  final String? emptyMessage;

  @override
  State<_PickerSheet<T>> createState() => _PickerSheetState<T>();
}

class _PickerSheetState<T> extends State<_PickerSheet<T>> {
  String _query = '';

  static String _fold(String value) => value
      .toLowerCase()
      .replaceAll(RegExp('[àâä]'), 'a')
      .replaceAll(RegExp('[éèêë]'), 'e')
      .replaceAll(RegExp('[îï]'), 'i')
      .replaceAll(RegExp('[ôö]'), 'o')
      .replaceAll(RegExp('[ùûü]'), 'u')
      .replaceAll('ç', 'c');

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final l10n = AppLocalizations.of(context);
    final words = _fold(_query).split(RegExp(r'\s+')).where((word) => word.isNotEmpty);
    final visible = widget.options
        .where((option) => words.every((word) => _fold('${option.label} ${option.detail ?? ''}').contains(word)))
        .toList();
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (context, scrollController) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(DtSpace.s4, DtSpace.s4, DtSpace.s2, DtSpace.s2),
            child: Row(
              children: [
                Expanded(
                  child: Text(widget.title, style: DtType.title.copyWith(color: colors.ink)),
                ),
                IconButton(
                  tooltip: l10n.commonClose,
                  icon: Icon(LucideIcons.x, color: colors.inkSecondary),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
          if (widget.searchable && widget.options.length > 8)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: DtSpace.s4),
              child: TextField(
                autofocus: false,
                onChanged: (value) => setState(() => _query = value),
                style: DtType.body.copyWith(color: colors.ink),
                decoration: InputDecoration(
                  hintText: l10n.commonSearch,
                  prefixIcon: Icon(LucideIcons.search, color: colors.inkMuted),
                  filled: true,
                  fillColor: colors.surfaceSunken,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(DtRadius.md),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
          Expanded(
            child: visible.isEmpty
                ? Padding(
                    padding: const EdgeInsets.all(DtSpace.s6),
                    child: Text(
                      widget.emptyMessage ?? '',
                      textAlign: TextAlign.center,
                      style: DtType.body.copyWith(color: colors.inkMuted),
                    ),
                  )
                : ListView.builder(
                    controller: scrollController,
                    itemCount: visible.length,
                    itemBuilder: (context, index) {
                      final option = visible[index];
                      final isSelected = option.value == widget.selected;
                      return ListTile(
                        minTileHeight: DtSize.row,
                        title: Text(option.label, style: DtType.body.copyWith(color: colors.ink)),
                        subtitle: option.detail == null
                            ? null
                            : Text(option.detail!, style: DtType.caption.copyWith(color: colors.inkMuted)),
                        trailing: isSelected ? Icon(LucideIcons.check, color: colors.brand) : null,
                        selected: isSelected,
                        onTap: () => Navigator.of(context).pop(option.value),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
