import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_error.dart';
import '../../core/api/generated/models/professional_type.dart';
import '../../core/auth/session.dart';
import '../../core/auth/session_controller.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_badge.dart';
import '../../ui/dt_button.dart';
import '../../ui/dt_page.dart';
import '../../ui/error_text.dart';
import '../../ui/tokens.dart';
import '../account/account_controller.dart';
import 'onboarding_draft.dart';

/// ScreenRoleSelect « Qui êtes-vous ? »: sets `professionalType` and nothing else. Before sign-up
/// the choice waits in memory; for a signed-in account without a profile it is recorded at once.
class RoleSelectScreen extends ConsumerStatefulWidget {
  const RoleSelectScreen({super.key});

  @override
  ConsumerState<RoleSelectScreen> createState() => _RoleSelectScreenState();
}

/// The role selected, progress and error.
class _RoleSelectScreenState extends ConsumerState<RoleSelectScreen> {
  ProfessionalType? _selected;
  bool _saving = false;
  ApiError? _error;

  /// Pre-selects a role chosen earlier in onboarding.
  @override
  void initState() {
    super.initState();
    _selected = ref.read(onboardingDraftProvider).role;
  }

  bool get _signedIn => ref.read(sessionControllerProvider).value is UserSession;

  /// « Continuer »: before an account, remembers the role and opens sign-up; signed in, saves it on the account.
  Future<void> _continue() async {
    final role = _selected;
    if (role == null) return;
    if (!_signedIn) {
      ref.read(onboardingDraftProvider.notifier).chooseRole(role);
      await context.push(Routes.signUp);
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(accountControllerProvider.notifier).setProfessionalType(role);
      if (mounted) context.go(Routes.verificationIntro);
    } catch (error) {
      final apiError = ApiError.from(error);
      if (apiError.code == 'PROFILE_ALREADY_SET') {
        await ref.read(accountControllerProvider.notifier).reload();
        if (mounted) context.go(Routes.home);
        return;
      }
      if (mounted) setState(() => _error = apiError);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final signedIn = ref.watch(sessionControllerProvider).value is UserSession;
    final options = [
      (ProfessionalType.doctor, l10n.roleDoctor, l10n.roleDoctorLine, l10n.rolePro, DtBadgeVariant.brand),
      (ProfessionalType.resident, l10n.roleResident, l10n.roleResidentLine, l10n.rolePro, DtBadgeVariant.brand),
      (ProfessionalType.student, l10n.roleStudent, l10n.roleStudentLine, l10n.roleFree, DtBadgeVariant.teal),
    ];
    return DtPage(
      showBack: !signedIn,
      eyebrow: signedIn ? null : l10n.commonStepOf('1', '3'),
      title: l10n.roleTitle,
      intro: l10n.roleIntro,
      actions: [
        if (_error != null) DtAlert(severity: DtAlertSeverity.critical, body: commonErrorText(context, _error!)),
        // « Continuer »: possible once a role is chosen.
        DtButton(label: l10n.commonContinue, loading: _saving, onPressed: _selected == null ? null : _continue),
        Text(
          l10n.roleNote,
          textAlign: TextAlign.center,
          style: DtType.caption.copyWith(color: colors.inkMuted),
        ),
      ],
      children: [
        Semantics(
          container: true,
          label: l10n.roleTitle,
          child: Column(
            children: [
              for (final (index, option) in options.indexed) ...[
                if (index > 0) const SizedBox(height: DtSpace.s2),
                // A role row: selects it.
                _RoleRow(
                  title: option.$2,
                  line: option.$3,
                  badge: DtBadge(text: option.$4, variant: option.$5),
                  selected: _selected == option.$1,
                  onTap: () => setState(() => _selected = option.$1),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// One selectable role: title, line, badge and check mark.
class _RoleRow extends StatelessWidget {
  const _RoleRow({
    required this.title,
    required this.line,
    required this.badge,
    required this.selected,
    required this.onTap,
  });

  final String title;
  final String line;
  final Widget badge;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Semantics(
      inMutuallyExclusiveGroup: true,
      checked: selected,
      button: true,
      child: Material(
        color: selected ? colors.brandSoft : colors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(DtRadius.md),
          side: BorderSide(
            color: selected ? colors.brand : colors.border,
            width: selected ? DtBorder.focus : DtBorder.hairline,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(DtSpace.s4),
            child: Row(
              children: [
                Icon(
                  selected ? LucideIcons.circleCheck : LucideIcons.circle,
                  color: selected ? colors.brand : colors.inkMuted,
                  size: DtSpace.s6,
                ),
                const SizedBox(width: DtSpace.s3),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: DtType.bodyStrong.copyWith(color: colors.ink)),
                      Text(line, style: DtType.caption.copyWith(color: colors.inkSecondary)),
                    ],
                  ),
                ),
                const SizedBox(width: DtSpace.s2),
                badge,
              ],
            ),
          ),
        ),
      ),
    );
  }
}
