import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../l10n/generated/app_localizations.dart';
import '../theme/doktool_tokens.dart';
import 'glass.dart';
import 'tokens.dart';

/// Height of the soft fade from the hero's middle shade into the page ground (ADR-020).
const double kHeroFade = DtSpace.s6;

/// Text and icons placed on the hero (trailing actions such as « Plus tard ») take its colours.
class DtOnHero extends StatelessWidget {
  const DtOnHero({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final theme = Theme.of(context);
    return Theme(
      data: theme.copyWith(
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(foregroundColor: colors.onHero, overlayColor: colors.glassOnHero),
        ),
        iconTheme: theme.iconTheme.copyWith(color: colors.onHero),
      ),
      child: DefaultTextStyle.merge(
        style: TextStyle(color: colors.onHero),
        child: IconTheme.merge(
          data: IconThemeData(color: colors.onHero),
          child: child,
        ),
      ),
    );
  }
}

/// The row at the top of a hero: a frosted back button (when there is somewhere to go back to),
/// an optional title, and trailing actions, all in the hero's colours.
class DtHeroToolbar extends StatelessWidget {
  const DtHeroToolbar({
    this.title,
    this.titleWidget,
    this.trailing = const [],
    this.showBack = true,
    this.onBack,
    super.key,
  });

  final String? title;

  /// Replaces [title] when the title is not plain text (two lines, a badge beside it).
  final Widget? titleWidget;
  final List<Widget> trailing;
  final bool showBack;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final canPop = showBack && (onBack != null || context.canPop());
    return SizedBox(
      height: DtSize.topbar,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: DtSpace.s4),
        child: Row(
          children: [
            if (canPop) ...[
              // Back arrow of the header.
              DtGlassIconButton(
                icon: LucideIcons.chevronLeft,
                tooltip: l10n.commonBack,
                onPressed: onBack ?? () => context.pop(),
              ),
              const SizedBox(width: DtSpace.s3),
            ],
            Expanded(
              child: titleWidget != null
                  ? DefaultTextStyle(
                      style: DtType.title.copyWith(color: colors.onHero),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      child: Align(alignment: AlignmentDirectional.centerStart, child: titleWidget),
                    )
                  : title == null
                  ? const SizedBox.shrink()
                  : Semantics(
                      header: true,
                      child: Text(
                        title!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: DtType.title.copyWith(color: colors.onHero),
                      ),
                    ),
            ),
            if (trailing.isNotEmpty)
              DtOnHero(
                child: Row(mainAxisSize: MainAxisSize.min, children: trailing),
              ),
          ],
        ),
      ),
    );
  }
}

/// A screen's top bar in the glass style (ADR-020): the hero gradient behind the status bar and
/// the toolbar, fading into the page ground, with the title in white and a frosted back button.
/// For screens that build their own [Scaffold]; flow pages get the same top through [DtPage].
class DtHeroAppBar extends StatelessWidget implements PreferredSizeWidget {
  const DtHeroAppBar({this.title, this.titleWidget, this.actions = const [], this.showBack = true, super.key});

  final String? title;

  /// Replaces [title] when the title is not plain text (a loading placeholder, two lines).
  final Widget? titleWidget;
  final List<Widget> actions;
  final bool showBack;

  @override
  Size get preferredSize => const Size.fromHeight(DtSize.topbar + kHeroFade);

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final top = MediaQuery.paddingOf(context).top;
    final total = top + DtSize.topbar + kHeroFade;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [colors.heroStart, colors.heroMid, colors.heroEnd],
            stops: [0, (top + DtSize.topbar) / total, 1],
          ),
        ),
        child: Padding(
          padding: EdgeInsets.only(top: top, bottom: kHeroFade),
          child: DtHeroToolbar(title: title, titleWidget: titleWidget, trailing: actions, showBack: showBack),
        ),
      ),
    );
  }
}

/// The hero block that carries a page's eyebrow, title and intro in white, starting where the
/// fixed toolbar ends and fading into the page (scrolls with the content).
class DtHeroTitle extends StatelessWidget {
  const DtHeroTitle({this.eyebrow, this.title, this.intro, super.key});

  final String? eyebrow;
  final String? title;
  final String? intro;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final hasText = eyebrow != null || title != null || intro != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [colors.heroStart, colors.heroMid],
            ),
          ),
          child: Padding(
            padding: EdgeInsets.fromLTRB(DtSpace.s4, 0, DtSpace.s4, hasText ? DtSpace.s6 : DtSpace.s2),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (eyebrow != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: DtSpace.s1),
                    child: Text(eyebrow!, style: DtType.label.copyWith(color: colors.onHeroMuted)),
                  ),
                if (title != null)
                  Semantics(
                    header: true,
                    child: Text(title!, style: DtType.display.copyWith(color: colors.onHero)),
                  ),
                if (intro != null)
                  Padding(
                    padding: const EdgeInsets.only(top: DtSpace.s2),
                    child: Text(intro!, style: DtType.body.copyWith(color: colors.onHero)),
                  ),
              ],
            ),
          ),
        ),
        Container(
          height: kHeroFade,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [colors.heroMid, colors.heroEnd],
            ),
          ),
        ),
      ],
    );
  }
}

/// A free-form block on the hero (e.g. the search field), from behind the status bar down to a
/// fade into the page ground.
class DtHeroBand extends StatelessWidget {
  const DtHeroBand({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [colors.heroStart, colors.heroMid, colors.heroEnd],
            stops: const [0, 0.7, 1],
          ),
        ),
        child: Padding(
          padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top, bottom: kHeroFade),
          child: child,
        ),
      ),
    );
  }
}
