import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/doktool_tokens.dart';
import 'hero.dart';
import 'tokens.dart';

/// A mobile flow page in the glass style (ADR-020): the hero gradient behind the status bar and a
/// toolbar with a frosted back button and an optional trailing action (e.g. « Plus tard »); the
/// eyebrow (« Étape 1 sur 3 · Identité »), title and intro in white on the hero, fading into the
/// page; scrollable content with the 16 px gutter; the actions pinned at the bottom.
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
    return Scaffold(
      backgroundColor: colors.bg,
      body: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: Column(
          children: [
            // The toolbar stays on the deep part of the hero; the title block scrolls under it.
            ColoredBox(
              color: colors.heroStart,
              child: Padding(
                padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top),
                child: DtHeroToolbar(trailing: [?trailing], showBack: showBack, onBack: onBack),
              ),
            ),
            Expanded(
              child: SafeArea(
                top: false,
                bottom: actions.isEmpty,
                child: ListView(
                  padding: const EdgeInsets.only(bottom: DtSpace.s6),
                  children: [
                    DtHeroTitle(eyebrow: eyebrow, title: title, intro: intro),
                    const SizedBox(height: DtSpace.s2),
                    for (final child in children)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: DtSpace.s4),
                        child: child,
                      ),
                  ],
                ),
              ),
            ),
            if (actions.isNotEmpty)
              SafeArea(
                top: false,
                child: Padding(
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
              ),
          ],
        ),
      ),
    );
  }
}

/// A titled block on a lifted white card (settings sections, verification intro paragraphs,
/// summaries) — ADR-020.
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
        borderRadius: BorderRadius.circular(DtRadius.xl),
        border: Border.all(color: colors.glassHighlight, width: DtBorder.hairline),
        boxShadow: context.elevation.glass,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null) ...[
            Semantics(
              header: true,
              child: Text(title!, style: DtType.heading.copyWith(color: colors.ink)),
            ),
            const SizedBox(height: DtSpace.s1),
          ],
          child,
        ],
      ),
    );
  }
}
