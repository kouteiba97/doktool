import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../core/api/generated/models/item_access_dto.dart';
import '../core/api/generated/models/lock_reason.dart';
import '../core/api/generated/models/unlock_path.dart';
import '../l10n/generated/app_localizations.dart';
import '../router/app_router.dart';
import '../theme/doktool_tokens.dart';
import 'dt_button.dart';
import 'tokens.dart';
import '../features/analytics/analytics_host.dart';

/// The reason word shown next to the lock on a row (ScreenLockedStates). Never red, never hidden.
String lockWord(AppLocalizations l10n, LockReason? reason) => switch (reason) {
  LockReason.professionalOnly => l10n.lockWordDoctors,
  LockReason.demoLimit || LockReason.subscriptionRequired => l10n.lockWordPro,
  LockReason.verificationRequired || LockReason.verificationPending => l10n.lockWordVerification,
  LockReason.offlineUnavailable => l10n.lockWordOffline,
  LockReason.accountSuspended => l10n.lockWordSuspended,
  _ => l10n.lockWordUnavailable,
};

String lockExplanation(AppLocalizations l10n, LockReason? reason) => switch (reason) {
  LockReason.professionalOnly => l10n.lockProfessionalOnly,
  LockReason.demoLimit => l10n.lockDemoLimit,
  LockReason.subscriptionRequired => l10n.lockSubscriptionRequired,
  LockReason.verificationRequired => l10n.lockVerificationRequired,
  LockReason.verificationPending => l10n.lockVerificationPending,
  LockReason.accountSuspended => l10n.lockAccountSuspended,
  LockReason.offlineUnavailable => l10n.lockOfflineUnavailable,
  _ => l10n.lockNoLongerAvailable,
};

/// The lock word as a small inline label with the lock icon.
class LockLabel extends StatelessWidget {
  const LockLabel({required this.reason, super.key});

  final LockReason? reason;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final l10n = AppLocalizations.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(LucideIcons.lock, size: DtSpace.s4, color: colors.inkMuted),
        const SizedBox(width: DtSpace.s1),
        Text(lockWord(l10n, reason), style: DtType.label.copyWith(color: colors.inkMuted)),
      ],
    );
  }
}

/// The calm sheet a locked item opens (section 27): what the boundary is and, when there is one,
/// the single unlock path. Students get an explanation only — no purchase action (Lock L38).
Future<void> showLockSheet(BuildContext context, ItemAccessDto access, {required String title}) {
  final l10n = AppLocalizations.of(context);
  final colors = context.colors;
  final (String, String)? action = switch (access.unlockPath) {
    UnlockPath.subscriptionPlans => (l10n.lockSeePlans, Routes.plans),
    UnlockPath.authSignUp => (l10n.lockCreateAccount, Routes.welcome),
    UnlockPath.verificationStart ||
    UnlockPath.verificationStatus => (l10n.lockSeeVerification, Routes.verificationStatus),
    UnlockPath.onboardingRole => (l10n.lockSeeVerification, Routes.role),
    _ => null,
  };
  final demo = access.lockReason == LockReason.demoLimit;
  if (demo) recordDemoLimit(context);
  return showModalBottomSheet<void>(
    context: context,
    useSafeArea: true,
    backgroundColor: colors.surface,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(DtRadius.xl))),
    builder: (sheetContext) => Padding(
      padding: const EdgeInsets.all(DtSpace.s5),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(title, style: DtType.heading.copyWith(color: colors.ink)),
              ),
              LockLabel(reason: access.lockReason),
            ],
          ),
          const SizedBox(height: DtSpace.s2),
          Text(lockExplanation(l10n, access.lockReason), style: DtType.body.copyWith(color: colors.inkSecondary)),
          const SizedBox(height: DtSpace.s5),
          if (action != null) ...[
            DtButton(
              label: action.$1,
              onPressed: () {
                Navigator.of(sheetContext).pop();
                context.push(action.$2);
              },
            ),
            const SizedBox(height: DtSpace.s2),
          ],
          DtButton(
            label: demo ? l10n.lockContinueDemo : l10n.commonClose,
            variant: action == null ? DtButtonVariant.primary : DtButtonVariant.secondary,
            onPressed: () => Navigator.of(sheetContext).pop(),
          ),
        ],
      ),
    ),
  );
}
