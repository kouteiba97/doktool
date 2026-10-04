import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/generated/models/access_profile_dto.dart';
import '../../core/api/generated/models/demo_context.dart';
import '../../core/api/generated/models/entitlement_tier.dart';
import '../../core/api/generated/models/professional_type.dart';
import '../../core/api/generated/models/verification_status.dart';
import '../../core/auth/session.dart';
import '../../core/auth/session_controller.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_alert.dart';
import '../../ui/glass.dart';
import '../../ui/tokens.dart';
import '../access/access_controller.dart';
import '../account/account_controller.dart';
import '../library/library_data.dart';
import '../notifications/notifications_screen.dart';
import '../verification/verification_controller.dart';
import '../../core/api/generated/models/reference_document_type.dart';
import '../../ui/content_row.dart';
import '../activity/activity_data.dart';
import '../activity/activity_screen.dart';
import '../activity/favorites_controller.dart';

/// ScreenHomeMobile / ScreenHomeStudent: identity line, the glass search field first, the three
/// V1 resources on one strip, then « Commencer ». What can be opened comes from the AccessProfile,
/// never from the professional type (Lock L34); the type only orders the quick actions.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final session = ref.watch(sessionControllerProvider).value;
    final access = ref.watch(accessControllerProvider).value;
    final account = ref.watch(accountControllerProvider).value;
    final demo = session is DemoSession ? session : null;
    final studentTier = access?.tier == EntitlementTier.student;

    final quick = [
      (LibrarySection.ordonnances, l10n.typesOrdonnances, LucideIcons.fileText),
      (LibrarySection.certificates, l10n.typesCertificates, LucideIcons.fileBadge),
      (LibrarySection.calculators, l10n.typesCalculators, LucideIcons.calculator),
      (LibrarySection.pregnancy, l10n.typesPregnancy, LucideIcons.baby),
    ];
    // Students lead with the calculators, the content open to them (ADR-006 Q2).
    if (studentTier) quick.insert(0, quick.removeAt(2));

    return Scaffold(
      backgroundColor: colors.bg,
      // Light status bar icons over the deep top of the hero (ADR-020).
      body: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: RefreshIndicator(
          onRefresh: () async {
            await ref.read(accessControllerProvider.notifier).reload();
            if (session is UserSession) await ref.read(verificationControllerProvider.notifier).reload();
          },
          child: ListView(
            padding: EdgeInsets.zero,
            children: [
              DtHeroBackground(
                child: SafeArea(
                  bottom: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(DtSpace.s4, DtSpace.s3, DtSpace.s4, DtSpace.s12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (demo != null) ...[_DemoBar(), const SizedBox(height: DtSpace.s4)],
                        _IdentityLine(
                          name: demo != null
                              ? l10n.demoLabel(
                                  demo.demoContext == DemoContext.resident ? l10n.roleResident : l10n.roleDoctor,
                                )
                              : account == null
                              ? ''
                              : '${account.firstName} ${account.lastName}',
                          line: [
                            if (account?.professionalType != null) _roleName(l10n, account!.professionalType!),
                            if (access != null) _accessName(l10n, access),
                          ].join(' · '),
                          showBell: session is UserSession,
                        ),
                        const SizedBox(height: DtSpace.s5),
                        _GlassSearchField(label: l10n.homeSearchHint, onTap: () => context.push(Routes.search)),
                      ],
                    ),
                  ),
                ),
              ),
              // The shortcuts card lifts over the pale end of the hero, as a card over glass.
              Transform.translate(
                offset: const Offset(0, -DtSpace.s8),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: DtSpace.s4),
                  child: _QuickActions(items: quick),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(DtSpace.s4, 0, DtSpace.s4, DtSize.bottomnav + DtSpace.s10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (session is UserSession) ...[const _VerificationLine(), const SizedBox(height: DtSpace.s4)],
                    if (studentTier) ...[
                      Text(l10n.homeStudentNote, style: DtType.body.copyWith(color: colors.inkSecondary)),
                      const SizedBox(height: DtSpace.s4),
                    ],
                    const _RecentsAndFavorites(),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _roleName(AppLocalizations l10n, ProfessionalType type) => switch (type) {
    ProfessionalType.doctor => l10n.roleDoctor,
    ProfessionalType.resident => l10n.roleResident,
    _ => l10n.roleStudent,
  };

  static String _accessName(AppLocalizations l10n, AccessProfileDto access) => switch (access.tier) {
    EntitlementTier.professional => l10n.accessPro,
    EntitlementTier.professionalUnpaid => l10n.accessSample,
    EntitlementTier.student => l10n.accessStudent,
    EntitlementTier.demo => l10n.accessDemo,
    _ => l10n.accessRestricted,
  };
}

class _IdentityLine extends ConsumerWidget {
  const _IdentityLine({required this.name, required this.line, required this.showBell});

  final String name;
  final String line;
  final bool showBell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.colors;
    final l10n = AppLocalizations.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final unread = showBell ? ref.watch(notificationsProvider).value?.unreadCount ?? 0 : 0;
    return Row(
      children: [
        SizedBox.square(
          dimension: DtSize.controlLg,
          child: DtGlass.onHero(
            radius: DtRadius.full,
            padding: const EdgeInsets.all(DtSpace.s2),
            child: SvgPicture.asset(
              dark ? 'assets/logos/doktool-mark-small-dark.svg' : 'assets/logos/doktool-mark-small.svg',
              excludeFromSemantics: true,
            ),
          ),
        ),
        const SizedBox(width: DtSpace.s3),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(
                header: true,
                child: Text(
                  name,
                  overflow: TextOverflow.ellipsis,
                  style: DtType.title.copyWith(color: colors.onHero),
                ),
              ),
              if (line.isNotEmpty) Text(line, style: DtType.label.copyWith(color: colors.onHeroMuted)),
            ],
          ),
        ),
        if (showBell)
          DtGlassIconButton(
            tooltip: l10n.homeNotifications,
            onPressed: () => context.push(Routes.notifications),
            icon: unread > 0 ? LucideIcons.bellDot : LucideIcons.bell,
          ),
      ],
    );
  }
}

class _GlassSearchField extends StatelessWidget {
  const _GlassSearchField({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(DtRadius.full),
          boxShadow: context.elevation.float,
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(DtRadius.full),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: DtBlur.glass, sigmaY: DtBlur.glass),
            child: Material(
              color: colors.glass,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(DtRadius.full),
                side: BorderSide(color: colors.glassHighlight, width: DtBorder.hairline),
              ),
              child: InkWell(
                onTap: onTap,
                child: SizedBox(
                  height: DtSize.controlLg,
                  child: Row(
                    children: [
                      const SizedBox(width: DtSpace.s4),
                      Icon(LucideIcons.search, color: colors.inkMuted),
                      const SizedBox(width: DtSpace.s2),
                      Expanded(
                        child: Text(label, style: DtType.body.copyWith(color: colors.inkSecondary)),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _QuickActions extends StatelessWidget {
  const _QuickActions({required this.items});

  final List<(LibrarySection, String, IconData)> items;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return DtLiftedCard(
      padding: const EdgeInsets.symmetric(vertical: DtSpace.s3, horizontal: DtSpace.s1),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final (section, label, icon) in items)
            Expanded(
              child: Semantics(
                button: true,
                label: label,
                excludeSemantics: true,
                child: InkWell(
                  borderRadius: BorderRadius.circular(DtRadius.lg),
                  onTap: () => context.go(Routes.library(section)),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: DtSpace.s2),
                    child: Column(
                      children: [
                        Container(
                          width: DtSize.controlLg,
                          height: DtSize.controlLg,
                          decoration: BoxDecoration(color: colors.brandSoft, shape: BoxShape.circle),
                          child: Icon(icon, color: colors.brand, size: DtSpace.s5),
                        ),
                        const SizedBox(height: DtSpace.s2),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: DtSpace.s1),
                          child: Text(
                            label,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                            style: DtType.caption.copyWith(color: colors.ink),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// One neutral line when verification needs attention (never red on Home).
class _VerificationLine extends ConsumerWidget {
  const _VerificationLine();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final overview = ref.watch(verificationControllerProvider).value;
    if (overview == null) return const SizedBox.shrink();
    final statuses = [for (final type in overview.relevantTypes) overview.stateOf(type).latest?.status];
    final String? message;
    if (statuses.contains(VerificationStatus.rejected) || statuses.contains(VerificationStatus.expired)) {
      message = l10n.homeVerificationToRedo;
    } else if (statuses.every((status) => status == VerificationStatus.verified)) {
      message = null;
    } else if (statuses.any(pendingStatuses.contains) &&
        statuses.every((status) => status != null && status != VerificationStatus.notStarted)) {
      message = l10n.homeVerificationPending;
    } else {
      message = l10n.homeVerificationRequired;
    }
    if (message == null) return const SizedBox.shrink();
    return DtAlert(
      severity: DtAlertSeverity.info,
      body: message,
      action: InkWell(
        onTap: () => context.push(Routes.verificationStatus),
        child: Text(l10n.homeVerificationLink, style: DtType.label.copyWith(color: colors.brand)),
      ),
    );
  }
}

/// « Mode démo · contenu d’exemple réel · Voir les offres » (ScreenDemo): thin, neutral.
class _DemoBar extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    return DtGlass.onHero(
      radius: DtRadius.full,
      padding: const EdgeInsets.only(left: DtSpace.s4),
      child: Row(
        children: [
          Icon(LucideIcons.eye, size: DtSpace.s4, color: colors.onHero),
          const SizedBox(width: DtSpace.s2),
          Expanded(
            child: Text(l10n.demoBar, style: DtType.caption.copyWith(color: colors.onHero)),
          ),
          TextButton(
            onPressed: () => context.push(Routes.plans),
            style: TextButton.styleFrom(minimumSize: const Size(0, DtSize.touchMin)),
            child: Text(
              l10n.lockSeePlans,
              style: DtType.label.copyWith(
                color: colors.onHero,
                decoration: TextDecoration.underline,
                decorationColor: colors.onHero,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Récents (models and calculators opened) and Favoris; on first use, a short « Commencer » list.
class _RecentsAndFavorites extends ConsumerWidget {
  const _RecentsAndFavorites();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final recents = ref.watch(recentContentProvider).value ?? const <ContentRef>[];
    final index = ref.watch(contentIndexProvider).value ?? const <String, ContentRef>{};
    final favoriteKeys = ref.watch(favoritesProvider).value?.keys ?? const <FavoriteKey>{};
    final favorites = [for (final key in favoriteKeys) ?index[key.id]].take(5).toList();

    Widget row(ContentRef content) => ContentRow(
      icon: content.isCalculator
          ? LucideIcons.calculator
          : content.referenceType == ReferenceDocumentType.certificate
          ? LucideIcons.fileBadge
          : LucideIcons.fileText,
      title: localizedTitle(context, content.titleFr, content.titleEn),
      access: content.access,
      actionLabel: content.isCalculator ? l10n.libraryOpen : l10n.libraryViewModel,
      onOpen: () => openContent(context, content),
    );

    if (recents.isEmpty && favorites.isEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l10n.homeStartTitle, style: DtType.heading.copyWith(color: colors.ink)),
          const SizedBox(height: DtSpace.s3),
          DtLiftedCard(
            padding: const EdgeInsets.symmetric(vertical: DtSpace.s1),
            child: Column(
              children: [
                for (final (section, label, icon) in [
                  (LibrarySection.ordonnances, l10n.homeStartOrdonnances, LucideIcons.fileText),
                  (LibrarySection.certificates, l10n.homeStartCertificates, LucideIcons.fileBadge),
                  (LibrarySection.calculators, l10n.homeStartCalculators, LucideIcons.calculator),
                  (LibrarySection.pregnancy, l10n.homeStartPregnancy, LucideIcons.baby),
                ])
                  ListTile(
                    minTileHeight: DtSize.row,
                    leading: Icon(icon, color: colors.brand),
                    title: Text(label, style: DtType.body.copyWith(color: colors.ink)),
                    trailing: Icon(LucideIcons.chevronRight, color: colors.inkMuted),
                    onTap: () => context.go(Routes.library(section)),
                  ),
              ],
            ),
          ),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (recents.isNotEmpty) ...[
          Text(l10n.homeRecents, style: DtType.heading.copyWith(color: colors.ink)),
          const SizedBox(height: DtSpace.s3),
          DtLiftedCard(
            padding: EdgeInsets.zero,
            child: Column(children: [for (final content in recents) row(content)]),
          ),
          const SizedBox(height: DtSpace.s5),
        ],
        if (favorites.isNotEmpty) ...[
          Text(l10n.homeFavorites, style: DtType.heading.copyWith(color: colors.ink)),
          const SizedBox(height: DtSpace.s3),
          DtLiftedCard(
            padding: EdgeInsets.zero,
            child: Column(children: [for (final content in favorites) row(content)]),
          ),
        ],
      ],
    );
  }
}
