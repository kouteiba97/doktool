import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/tokens.dart';
import '../offline/offline_bar.dart';

/// The tab scaffold (BottomNav): Accueil · Recherche (raised disc) · Bibliothèque · Profil on a
/// Clinical Glass bar. Each tab keeps its stack; re-tapping the active tab pops to its root; the
/// disc opens the search overlay. The bar hides while the keyboard is up.
class AppShell extends ConsumerWidget {
  const AppShell({required this.navigationShell, this.profileAttention = false, super.key});

  final StatefulNavigationShell navigationShell;

  /// Dot on « Profil » when verification needs an action.
  final bool profileAttention;

  void _go(int branch) => navigationShell.goBranch(branch, initialLocation: branch == navigationShell.currentIndex);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final keyboardUp = MediaQuery.viewInsetsOf(context).bottom > 0;
    final barShown = ref.watch(offlineBarKindProvider) != null;
    return Scaffold(
      extendBody: true,
      body: barShown
          ? Column(
              children: [
                const SafeArea(bottom: false, child: OfflineBar()),
                Expanded(
                  child: MediaQuery.removePadding(context: context, removeTop: true, child: navigationShell),
                ),
              ],
            )
          : navigationShell,
      bottomNavigationBar: keyboardUp
          ? null
          : _GlassBar(
              current: navigationShell.currentIndex,
              onSelect: _go,
              onSearch: () => context.push(Routes.search),
              profileAttention: profileAttention,
            ),
    );
  }
}

class _GlassBar extends StatelessWidget {
  const _GlassBar({
    required this.current,
    required this.onSelect,
    required this.onSearch,
    required this.profileAttention,
  });

  final int current;
  final ValueChanged<int> onSelect;
  final VoidCallback onSearch;
  final bool profileAttention;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final l10n = AppLocalizations.of(context);
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(DtRadius.lg)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: DtBlur.glass, sigmaY: DtBlur.glass),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: colors.glass,
            border: Border(
              top: BorderSide(color: colors.glassBorder, width: DtBorder.hairline),
            ),
          ),
          child: SafeArea(
            top: false,
            child: SizedBox(
              height: DtSize.bottomnav,
              child: Semantics(
                container: true,
                explicitChildNodes: true,
                child: Row(
                  children: [
                    _Destination(
                      icon: LucideIcons.house,
                      label: l10n.navHome,
                      selected: current == 0,
                      onTap: () => onSelect(0),
                    ),
                    Expanded(
                      child: Center(
                        child: Semantics(
                          button: true,
                          label: l10n.navSearch,
                          child: InkResponse(
                            onTap: onSearch,
                            radius: DtSize.controlLg,
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: DtSize.controlLg,
                                  height: DtSize.controlLg,
                                  decoration: BoxDecoration(color: colors.brand, shape: BoxShape.circle),
                                  child: Icon(LucideIcons.search, color: colors.onBrand),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                    _Destination(
                      icon: LucideIcons.libraryBig,
                      label: l10n.navLibrary,
                      selected: current == 1,
                      onTap: () => onSelect(1),
                    ),
                    _Destination(
                      icon: LucideIcons.circleUser,
                      label: l10n.navProfile,
                      selected: current == 2,
                      attention: profileAttention,
                      onTap: () => onSelect(2),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Destination extends StatelessWidget {
  const _Destination({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
    this.attention = false,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final bool attention;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final color = selected ? colors.brand : colors.inkSecondary;
    return Expanded(
      child: Semantics(
        button: true,
        selected: selected,
        label: label,
        excludeSemantics: true,
        child: InkResponse(
          onTap: onTap,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Icon(icon, color: color, size: DtSpace.s6),
                  if (attention)
                    Positioned(
                      right: -2,
                      top: -2,
                      child: Container(
                        width: DtSpace.s2,
                        height: DtSpace.s2,
                        decoration: BoxDecoration(color: colors.warning, shape: BoxShape.circle),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 2),
              Text(label, style: DtType.caption.copyWith(color: color)),
            ],
          ),
        ),
      ),
    );
  }
}
