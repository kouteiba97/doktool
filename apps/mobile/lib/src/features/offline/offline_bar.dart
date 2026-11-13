import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/network/connectivity.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/error_text.dart';
import '../../ui/tokens.dart';
import 'offline_sync.dart';

/// The bars the shell can show: offline, syncing, sync failed, data outdated.
enum OfflineBarKind { offline, syncing, failed, outdated }

/// Which bar shows, if any (the shell reserves its place under the status bar).
final offlineBarKindProvider = Provider<OfflineBarKind?>((ref) {
  final status = ref.watch(offlineSyncProvider).value;
  if (!ref.watch(isOnlineProvider)) return OfflineBarKind.offline;
  if (status == null || !status.enabled) return null;
  return switch (status.phase) {
    SyncPhase.syncing => OfflineBarKind.syncing,
    SyncPhase.failed => OfflineBarKind.failed,
    SyncPhase.idle => status.outdated ? OfflineBarKind.outdated : null,
  };
});

/// OfflineBar (section 18): neutral when offline, progress while syncing, warning when the data is
/// older than 30 days, critical with « Réessayer » when a sync failed. Nothing when all is well.
/// Tapping it opens « Données et hors ligne ».
class OfflineBar extends ConsumerWidget {
  const OfflineBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final kind = ref.watch(offlineBarKindProvider);
    final status = ref.watch(offlineSyncProvider).value;

    final (Color background, Color foreground, IconData icon, String text, Widget? trailing)? bar;
    if (kind == null) {
      bar = null;
    } else if (kind == OfflineBarKind.offline) {
      bar = (
        colors.surfaceSunken,
        colors.inkSecondary,
        LucideIcons.wifiOff,
        status?.syncedAt == null
            ? l10n.offlineBarOfflineNoData
            : l10n.offlineBarOffline(dateText(context, status!.syncedAt), status.dataVersion?.substring(0, 8) ?? '—'),
        null,
      );
    } else if (kind == OfflineBarKind.syncing) {
      bar = (
        colors.surfaceSunken,
        colors.inkSecondary,
        LucideIcons.refreshCw,
        l10n.offlineBarSyncing,
        SizedBox(
          width: DtSpace.s12,
          child: LinearProgressIndicator(value: status?.progress, color: colors.brand),
        ),
      );
    } else if (kind == OfflineBarKind.failed) {
      bar = (
        colors.criticalSoft,
        colors.critical,
        LucideIcons.circleAlert,
        '${l10n.offlineBarFailed} ${status?.failure == null ? '' : commonErrorText(context, status!.failure!)}',
        // « Réessayer » the sync.
        TextButton(
          onPressed: () => unawaited(ref.read(offlineSyncProvider.notifier).sync()),
          child: Text(l10n.commonRetry, style: DtType.label.copyWith(color: colors.critical)),
        ),
      );
    } else {
      bar = (colors.warningSoft, colors.warning, LucideIcons.clock, l10n.offlineBarOutdated, null);
    }
    if (bar == null) return const SizedBox.shrink();
    final (background, foreground, icon, text, trailing) = bar;
    return Semantics(
      container: true,
      liveRegion: true,
      child: Material(
        color: background,
        // The bar: opens « Données et hors ligne ».
        child: InkWell(
          onTap: () => context.push(Routes.offlineSettings),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: DtSpace.s4, vertical: DtSpace.s2),
            child: Row(
              children: [
                Icon(icon, size: DtSpace.s4, color: foreground),
                const SizedBox(width: DtSpace.s2),
                Expanded(
                  child: Text(text, style: DtType.caption.copyWith(color: foreground)),
                ),
                ?trailing,
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Runs the offline sync at launch, on resume after 6 hours and when the connection returns.
class OfflineSyncHost extends ConsumerStatefulWidget {
  const OfflineSyncHost({required this.child, super.key});

  final Widget child;

  @override
  ConsumerState<OfflineSyncHost> createState() => _OfflineSyncHostState();
}

/// Syncs again when the app returns to the foreground and the data is stale.
class _OfflineSyncHostState extends ConsumerState<OfflineSyncHost> with WidgetsBindingObserver {
  /// Starts listening to the app lifecycle.
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  /// Stops listening to the app lifecycle.
  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Back in the foreground: syncs if the data is stale.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(ref.read(offlineSyncProvider.notifier).sync(ifStale: true));
  }

  @override
  Widget build(BuildContext context) {
    ref
      ..listen(offlineSyncProvider, (previous, next) {
        final opened = previous?.value?.enabled != true && next.value?.enabled == true;
        if (opened) unawaited(ref.read(offlineSyncProvider.notifier).sync(ifStale: true));
      })
      ..listen(isOnlineProvider, (wasOnline, online) {
        if (wasOnline == false && online) unawaited(ref.read(offlineSyncProvider.notifier).sync(ifStale: true));
      });
    return widget.child;
  }
}
