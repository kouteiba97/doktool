import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/generated/models/entitlement_tier.dart';
import '../../core/api/generated/models/professional_type.dart';
import '../../core/api/generated/models/verification_status.dart';
import '../../core/auth/session.dart';
import '../../core/auth/session_controller.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_badge.dart';
import '../../ui/glass.dart';
import '../../ui/tokens.dart';
import '../access/access_controller.dart';
import '../verification/verification_controller.dart';
import 'profile_data.dart';

/// ScreenProfileMobile: header (photo, name, type, verification and access badges, « Modifier »),
/// then Activité et favoris, Abonnement (students: « Accès étudiant — gratuit »), Vérification,
/// Notifications, Paramètres, Se déconnecter. A demo sees Paramètres and « Quitter la démo » only.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final session = ref.watch(sessionControllerProvider).value;
    final user = session is UserSession;
    final me = user ? ref.watch(meProvider).value : null;
    final access = ref.watch(accessControllerProvider).value;
    final student = access?.tier == EntitlementTier.student;

    Widget row(IconData icon, String label, VoidCallback? onTap, {Color? color, String? trailing}) => ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: DtSpace.s4),
      minTileHeight: DtSize.row,
      leading: Icon(icon, color: color ?? colors.inkSecondary),
      title: Text(label, style: DtType.body.copyWith(color: color ?? colors.ink)),
      trailing: trailing != null
          ? Text(trailing, style: DtType.caption.copyWith(color: colors.inkMuted))
          : onTap == null || color != null
          ? null
          : Icon(LucideIcons.chevronRight, color: colors.inkMuted),
      onTap: onTap,
    );

    Widget card(List<Widget> rows) => DtLiftedCard(
      padding: EdgeInsets.zero,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(DtRadius.xl),
        child: Material(
          type: MaterialType.transparency,
          child: Column(
            children: [
              for (final (index, item) in rows.indexed) ...[
                if (index > 0) Divider(height: DtBorder.hairline, thickness: DtBorder.hairline, color: colors.border),
                item,
              ],
            ],
          ),
        ),
      ),
    );

    return Scaffold(
      backgroundColor: colors.bg,
      body: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: RefreshIndicator(
          onRefresh: () async {
            if (user) ref.invalidate(meProvider);
            await ref.read(accessControllerProvider.notifier).reload();
          },
          child: ListView(
            padding: const EdgeInsets.only(bottom: DtSize.bottomnav + DtSpace.s10),
            children: [
              // ADR-020: the identity sits on the hero, the menu in lifted white cards below.
              DtHeroBackground(
                child: Padding(
                  padding: EdgeInsets.fromLTRB(
                    DtSpace.s4,
                    MediaQuery.paddingOf(context).top + DtSpace.s3,
                    DtSpace.s4,
                    DtSpace.s8,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Semantics(
                        header: true,
                        child: Text(l10n.profileTitle, style: DtType.display.copyWith(color: colors.onHero)),
                      ),
                      if (me != null) ...[
                        const SizedBox(height: DtSpace.s4),
                        Row(
                          children: [
                            // The initials repeat the name read just after.
                            ExcludeSemantics(
                              child: DtGlass.onHero(
                                radius: DtRadius.full,
                                padding: const EdgeInsets.all(DtSpace.s1),
                                child: ProfileAvatar(url: me.avatarUrl, initials: _initials(me.firstName, me.lastName)),
                              ),
                            ),
                            const SizedBox(width: DtSpace.s3),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    '${me.firstName} ${me.lastName}',
                                    style: DtType.title.copyWith(color: colors.onHero),
                                  ),
                                  if (me.professionalProfile != null)
                                    Text(
                                      [
                                        _roleName(l10n, me.professionalProfile!.professionalType),
                                        me.wilaya.name,
                                      ].join(' · '),
                                      style: DtType.label.copyWith(color: colors.onHero),
                                    ),
                                ],
                              ),
                            ),
                            // Its own button: otherwise the whole identity block reads as one control.
                            Semantics(
                              container: true,
                              button: true,
                              label: l10n.profileEdit,
                              onTap: () => context.push(Routes.profileEdit),
                              excludeSemantics: true,
                              child: DtGlass.onHero(
                                radius: DtRadius.full,
                                child: Material(
                                  type: MaterialType.transparency,
                                  // « Modifier le profil ».
                                  child: InkWell(
                                    customBorder: const StadiumBorder(),
                                    onTap: () => context.push(Routes.profileEdit),
                                    child: ConstrainedBox(
                                      constraints: const BoxConstraints(minHeight: DtSize.touchMin),
                                      child: Padding(
                                        padding: const EdgeInsets.symmetric(horizontal: DtSpace.s4),
                                        child: Center(
                                          widthFactor: 1,
                                          child: Text(
                                            l10n.profileEdit,
                                            style: DtType.label.copyWith(color: colors.onHero),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: DtSpace.s4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (me != null) ...[const _Badges(), const SizedBox(height: DtSpace.s3)],
                    if (me?.bio != null) ...[
                      DtLiftedCard(
                        child: Text(me!.bio!, style: DtType.body.copyWith(color: colors.inkSecondary)),
                      ),
                      const SizedBox(height: DtSpace.s3),
                    ],
                    card([
                      if (user) ...[
                        row(LucideIcons.history, l10n.profileActivity, () => context.push(Routes.profileActivity)),
                        student
                            ? row(LucideIcons.graduationCap, l10n.profileStudentAccess, null)
                            : row(
                                LucideIcons.creditCard,
                                l10n.profileSubscription,
                                () => context.push(Routes.subscription),
                              ),
                        row(
                          LucideIcons.badgeCheck,
                          l10n.profileVerification,
                          () => context.push(Routes.verificationStatus),
                        ),
                        row(LucideIcons.bell, l10n.profileNotifications, () => context.push(Routes.notifications)),
                      ],
                      row(LucideIcons.settings, l10n.profileSettings, () => context.push(Routes.settings)),
                    ]),
                    const SizedBox(height: DtSpace.s3),
                    card([
                      row(
                        LucideIcons.logOut,
                        user ? l10n.profileSignOut : l10n.demoEnd,
                        () => ref.read(sessionControllerProvider.notifier).signOut(),
                        color: colors.brand,
                      ),
                    ]),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// The initials shown when there is no photo.
  static String _initials(String first, String last) =>
      '${first.characters.firstOrNull ?? ''}${last.characters.firstOrNull ?? ''}'.toUpperCase();

  /// The profession's name in the UI language.
  static String _roleName(AppLocalizations l10n, ProfessionalType type) => switch (type) {
    ProfessionalType.doctor => l10n.roleDoctor,
    ProfessionalType.resident => l10n.roleResident,
    _ => l10n.roleStudent,
  };
}

/// Verification and access, as words with a reinforcing colour (never colour alone).
class _Badges extends ConsumerWidget {
  const _Badges();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final overview = ref.watch(verificationControllerProvider).value;
    final access = ref.watch(accessControllerProvider).value;
    final statuses = overview == null
        ? const <VerificationStatus?>[]
        : [for (final type in overview.relevantTypes) overview.stateOf(type).latest?.status];
    final verified = statuses.isNotEmpty && statuses.every((status) => status == VerificationStatus.verified);
    final pending = statuses.any(pendingStatuses.contains);
    return Wrap(
      spacing: DtSpace.s1,
      runSpacing: DtSpace.s1,
      children: [
        if (verified)
          DtBadge(text: l10n.verificationBadgeVerified, variant: DtBadgeVariant.teal, icon: LucideIcons.badgeCheck)
        else if (pending)
          DtBadge(text: l10n.verificationBadgeInReview, variant: DtBadgeVariant.info, icon: LucideIcons.clock),
        if (access?.tier == EntitlementTier.professional) DtBadge(text: l10n.accessPro, variant: DtBadgeVariant.brand),
      ],
    );
  }
}

/// The profile photo, or the initials when there is none.
class ProfileAvatar extends StatelessWidget {
  const ProfileAvatar({
    required this.url,
    required this.initials,
    this.size = DtSize.controlLg + DtSpace.s4,
    super.key,
  });

  final String? url;
  final String initials;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return ClipOval(
      child: SizedBox.square(
        dimension: size,
        child: url == null
            ? ColoredBox(
                color: colors.brandSoft,
                child: Center(
                  child: Text(initials, style: DtType.heading.copyWith(color: colors.brandStrong)),
                ),
              )
            : Image.network(
                url!,
                fit: BoxFit.cover,
                semanticLabel: initials,
                errorBuilder: (context, _, _) => ColoredBox(
                  color: colors.brandSoft,
                  child: Center(
                    child: Text(initials, style: DtType.heading.copyWith(color: colors.brandStrong)),
                  ),
                ),
              ),
      ),
    );
  }
}
