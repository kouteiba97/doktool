import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_page.dart';
import '../../ui/glass.dart';
import '../../ui/tokens.dart';

/// « Accès perdu ? » (ADR-023): three situations, each to the shortest way back in. The heavy
/// path (identity check) is offered only when nothing simpler can work.
class AccessHelpScreen extends StatelessWidget {
  const AccessHelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return DtPage(
      title: l10n.accessHelpTitle,
      intro: l10n.accessHelpIntro,
      children: [
        _Choice(
          icon: LucideIcons.keyRound,
          title: l10n.accessHelpForgotTitle,
          body: l10n.accessHelpForgotBody,
          onTap: () => context.push(Routes.resetRequest),
        ),
        const SizedBox(height: DtSpace.s3),
        _Choice(
          icon: LucideIcons.arrowLeftRight,
          title: l10n.accessHelpContactTitle,
          body: l10n.accessHelpContactBody,
          onTap: () => context.pushReplacement(Routes.signIn),
        ),
        const SizedBox(height: DtSpace.s3),
        _Choice(
          icon: LucideIcons.shieldQuestion,
          title: l10n.accessHelpLostTitle,
          body: l10n.accessHelpLostBody,
          onTap: () => context.push(Routes.recovery),
        ),
        const SizedBox(height: DtSpace.s6),
        DtAlert(severity: DtAlertSeverity.info, body: l10n.accessHelpTip),
      ],
    );
  }
}

class _Choice extends StatelessWidget {
  const _Choice({required this.icon, required this.title, required this.body, required this.onTap});

  final IconData icon;
  final String title;
  final String body;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Semantics(
      button: true,
      child: DtLiftedCard(
        padding: EdgeInsets.zero,
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(DtRadius.xl),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(DtSpace.s4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: DtSize.touchMin,
                    height: DtSize.touchMin,
                    decoration: BoxDecoration(color: colors.brandSoft, shape: BoxShape.circle),
                    child: Icon(icon, color: colors.brand, size: DtSpace.s5),
                  ),
                  const SizedBox(width: DtSpace.s3),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Semantics(
                          header: true,
                          child: Text(title, style: DtType.heading.copyWith(color: colors.ink)),
                        ),
                        const SizedBox(height: DtSpace.s1),
                        Text(body, style: DtType.body.copyWith(color: colors.inkSecondary)),
                      ],
                    ),
                  ),
                  Icon(LucideIcons.chevronRight, color: colors.inkMuted),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
