import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../l10n/generated/app_localizations.dart';
import '../theme/doktool_tokens.dart';
import 'tokens.dart';

/// A mobile flow page: top bar with back and an optional trailing action (e.g. « Plus tard »),
/// an eyebrow line (« Étape 1 sur 3 · Identité »), a title, scrollable content with the 16 px
/// gutter, and the actions pinned at the bottom above the keyboard.
class DtPage extends StatelessWidget {
  const DtPage({
    required this.children,
    this.title,
    this.eyebrow,
    this.intro,
    this.actions = const [],
    this.trailing,
    this.showBack = true,
    this.onBack,
    super.key,
  });

  final String? eyebrow;
  final String? title;
  final String? intro;
  final List<Widget> children;

  /// Bottom actions, primary first.
  final List<Widget> actions;
  final Widget? trailing;
  final bool showBack;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final l10n = AppLocalizations.of(context);
    final canPop = showBack && (onBack != null || context.canPop());
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.bg,
        surfaceTintColor: colors.bg,
        elevation: 0,
        automaticallyImplyLeading: false,
        leading: canPop
            ? IconButton(
                tooltip: l10n.commonBack,
                icon: Icon(LucideIcons.chevronLeft, color: colors.ink),
                onPressed: onBack ?? () => context.pop(),
              )
            : null,
        actions: [
          ?trailing,
          const SizedBox(width: DtSpace.s2),
        ],
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(DtSpace.s4, 0, DtSpace.s4, DtSpace.s6),
                children: [
                  if (eyebrow != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: DtSpace.s1),
                      child: Text(eyebrow!, style: DtType.label.copyWith(color: colors.inkMuted)),
                    ),
                  if (title != null)
                    Semantics(
                      header: true,
                      child: Text(title!, style: DtType.display.copyWith(color: colors.ink)),
                    ),
                  if (intro != null)
                    Padding(
                      padding: const EdgeInsets.only(top: DtSpace.s2),
                      child: Text(intro!, style: DtType.body.copyWith(color: colors.inkSecondary)),
                    ),
                  if (title != null || intro != null) const SizedBox(height: DtSpace.s6),
                  ...children,
                ],
              ),
            ),
            if (actions.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(DtSpace.s4, DtSpace.s2, DtSpace.s4, DtSpace.s4),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (final (index, action) in actions.indexed) ...[
                      if (index > 0) const SizedBox(height: DtSpace.s2),
                      action,
                    ],
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// A titled block on a surface (settings sections, verification intro paragraphs, summaries).
class DtSection extends StatelessWidget {
  const DtSection({required this.child, this.title, super.key});

  final String? title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(DtSpace.s4),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(DtRadius.md),
        border: Border.all(color: colors.border, width: DtBorder.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null) ...[
            Text(title!, style: DtType.heading.copyWith(color: colors.ink)),
            const SizedBox(height: DtSpace.s1),
          ],
          child,
        ],
      ),
    );
  }
}
