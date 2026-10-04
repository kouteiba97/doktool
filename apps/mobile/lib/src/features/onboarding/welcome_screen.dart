import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_button.dart';
import '../../ui/dt_logo.dart';
import '../../ui/glass.dart';
import '../../ui/tokens.dart';
import 'auth_memory.dart';
import 'onboarding_draft.dart';

/// ScreenWelcome: vertical lockup, the promise in one line, three actions in order of commitment.
/// A returning device makes « Se connecter » the primary action.
class WelcomeScreen extends ConsumerWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final returning = ref.watch(lastIdentifierProvider).value != null;
    final choices = [
      DtButton(
        label: l10n.welcomeCreateAccount,
        variant: returning ? DtButtonVariant.secondary : DtButtonVariant.primary,
        onPressed: () {
          ref.read(onboardingDraftProvider.notifier).reset();
          context.push(Routes.role);
        },
      ),
      const SizedBox(height: DtSpace.s2),
      DtButton(
        label: l10n.welcomeSignIn,
        variant: returning ? DtButtonVariant.primary : DtButtonVariant.secondary,
        onPressed: () => context.push(Routes.signIn),
      ),
      const SizedBox(height: DtSpace.s2),
      DtButton(
        label: l10n.welcomeDemo,
        variant: DtButtonVariant.ghost,
        onPressed: () => context.push(Routes.demoStart),
      ),
      const SizedBox(height: DtSpace.s2),
      Text(
        '${l10n.welcomeAudience}\n${l10n.welcomeDemoNote}',
        textAlign: TextAlign.center,
        style: DtType.caption.copyWith(color: colors.inkSecondary),
      ),
    ];
    return Scaffold(
      backgroundColor: colors.bg,
      body: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        // ADR-020: the brand on the deep part of the hero, the choices in a lifted white card.
        child: DtHeroBackground(
          child: SafeArea(
            child: LayoutBuilder(
              builder: (context, constraints) => SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: DtSpace.s4),
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: constraints.maxHeight),
                  child: IntrinsicHeight(
                    child: Column(
                      children: [
                        const Spacer(flex: 2),
                        const DtLogo(onHero: true),
                        const SizedBox(height: DtSpace.s4),
                        Text(
                          l10n.welcomePromise,
                          textAlign: TextAlign.center,
                          style: DtType.heading.copyWith(color: colors.onHero),
                        ),
                        const Spacer(flex: 3),
                        DtLiftedCard(child: Column(children: choices)),
                        const SizedBox(height: DtSpace.s4),
                      ],
                    ),
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
