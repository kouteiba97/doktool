import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/generated/models/access_state.dart';
import '../../core/api/generated/models/feature_key.dart';
import '../../core/network/connectivity.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_button.dart';
import '../../ui/dt_page.dart';
import '../../ui/error_text.dart';
import '../../ui/locks.dart';
import '../../ui/segmented_control.dart';
import '../../ui/tokens.dart';
import '../access/access_controller.dart';
import 'offline_sync.dart';

/// ScreenOfflinePacks « Données et hors ligne »: last sync, data version, storage, what downloads
/// (all models or favorites only), mobile data, update now and removal. V1 content only.
class OfflineSettingsScreen extends ConsumerWidget {
  const OfflineSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final status = ref.watch(offlineSyncProvider).value;
    final online = ref.watch(isOnlineProvider);
    final offlineFeature = ref.watch(accessControllerProvider).value?.feature(FeatureKey.offlineSync);
    final locked = offlineFeature != null && offlineFeature.state == AccessState.locked;
    final controller = ref.read(offlineSyncProvider.notifier);

    Widget line(String text) => Padding(
      padding: const EdgeInsets.only(bottom: DtSpace.s1),
      child: Text(text, style: DtType.body.copyWith(color: colors.inkSecondary)),
    );

    return DtPage(
      title: l10n.offlineTitle,
      intro: l10n.offlineIntro,
      children: [
        if (status == null || !status.enabled)
          DtAlert(severity: DtAlertSeverity.neutral, body: l10n.offlineLocked)
        else ...[
          if (status.lostEntitlement) ...[
            DtAlert(severity: DtAlertSeverity.info, body: l10n.offlineLost),
            const SizedBox(height: DtSpace.s3),
          ],
          if (locked) ...[
            DtAlert(
              severity: DtAlertSeverity.neutral,
              title: l10n.offlineLocked,
              body: lockExplanation(l10n, offlineFeature.lockReason),
            ),
            const SizedBox(height: DtSpace.s3),
          ],
          DtSection(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                line(
                  status.syncedAt == null
                      ? l10n.offlineNeverSynced
                      : l10n.offlineLastSync(
                          '${dateText(context, status.syncedAt)} ${timeText(context, status.syncedAt)}',
                        ),
                ),
                if (status.dataVersion != null) line(l10n.offlineDataVersion(status.dataVersion!.substring(0, 12))),
                line(l10n.offlineModels(status.documents, sizeText(context, status.storageBytes))),
                line(l10n.offlineCalculators(status.calculators)),
                line(l10n.offlineSubstances(status.substances)),
                if (status.pendingDocuments > 0) line(l10n.offlinePending(status.pendingDocuments)),
                if (status.phase == SyncPhase.syncing) ...[
                  const SizedBox(height: DtSpace.s2),
                  LinearProgressIndicator(value: status.progress, color: colors.brand),
                ],
                if (status.phase == SyncPhase.failed && status.failure != null) ...[
                  const SizedBox(height: DtSpace.s2),
                  DtAlert(
                    severity: DtAlertSeverity.critical,
                    body: '${l10n.offlineBarFailed} ${commonErrorText(context, status.failure!)}',
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: DtSpace.s4),
          // Read once, as the label of the choice below.
          ExcludeSemantics(
            child: Text(l10n.offlineScope, style: DtType.label.copyWith(color: colors.inkSecondary)),
          ),
          const SizedBox(height: DtSpace.s1),
          DtSegmentedControl<OfflineScope>(
            semanticLabel: l10n.offlineScope,
            selected: status.scope,
            onChanged: (scope) => unawaited(controller.setScope(scope)),
            segments: [
              DtSegment(value: OfflineScope.all, label: l10n.offlineScopeAll),
              DtSegment(value: OfflineScope.favorites, label: l10n.offlineScopeFavorites),
            ],
          ),
          const SizedBox(height: DtSpace.s3),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: status.mobileData,
            activeThumbColor: colors.brand,
            title: Text(l10n.offlineMobileData, style: DtType.body.copyWith(color: colors.ink)),
            subtitle: Text(l10n.offlineMobileDataHelper, style: DtType.caption.copyWith(color: colors.inkMuted)),
            onChanged: (allowed) => unawaited(controller.setMobileData(allowed)),
          ),
          const SizedBox(height: DtSpace.s4),
          DtButton(
            label: l10n.offlineUpdate,
            loading: status.phase == SyncPhase.syncing,
            onPressed: online && !locked ? () => unawaited(controller.sync()) : null,
          ),
          if (status.documents > 0) ...[
            const SizedBox(height: DtSpace.s2),
            DtButton(
              label: l10n.offlineRemove,
              variant: DtButtonVariant.secondary,
              onPressed: () async {
                final confirmed = await showDialog<bool>(
                  context: context,
                  builder: (dialog) => AlertDialog(
                    content: Text(l10n.offlineRemoveConfirm),
                    actions: [
                      TextButton(onPressed: () => Navigator.of(dialog).pop(false), child: Text(l10n.commonCancel)),
                      TextButton(onPressed: () => Navigator.of(dialog).pop(true), child: Text(l10n.offlineRemove)),
                    ],
                  ),
                );
                if (confirmed == true) await controller.removeDocuments();
              },
            ),
          ],
        ],
      ],
    );
  }
}
