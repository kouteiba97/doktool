import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/api/generated/models/notification_dto.dart';
import '../../core/api/generated/models/notification_page_dto.dart';
import '../../core/auth/session.dart';
import '../../core/auth/session_controller.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_button.dart';
import '../../ui/error_text.dart';
import '../../ui/skeleton.dart';
import '../../ui/tokens.dart';

/// The person's notifications (newest first). Demo sessions have none.
class NotificationsController extends AsyncNotifier<NotificationPageDto?> {
  @override
  Future<NotificationPageDto?> build() async {
    final session = ref.watch(sessionControllerProvider).value;
    if (session is! UserSession) return null;
    return ref.read(apiProvider).notifications.notificationsControllerList();
  }

  Future<void> markAllRead() async {
    await ref.read(apiProvider).notifications.notificationsControllerMarkAllRead();
    ref.invalidateSelf();
  }

  Future<void> markRead(String id) async {
    await ref.read(apiProvider).notifications.notificationsControllerMarkRead(id: id);
    ref.invalidateSelf();
  }
}

final notificationsProvider = AsyncNotifierProvider<NotificationsController, NotificationPageDto?>(
  NotificationsController.new,
);

/// Renders a notification from its catalogue key (section 19); unknown keys are skipped.
String? notificationText(AppLocalizations l10n, NotificationDto notification) {
  final caseType = notification.params['caseType'] ?? '';
  return switch (notification.messageKey) {
    'mobile.notifications.verificationApproved' => l10n.notificationsVerificationApproved(caseType),
    'mobile.notifications.verificationRejected' => l10n.notificationsVerificationRejected(caseType),
    'mobile.notifications.verificationExpiring' => l10n.notificationsVerificationExpiring(
      caseType,
      notification.params['days'] ?? '',
    ),
    'mobile.notifications.verificationExpired' => l10n.notificationsVerificationExpired(caseType),
    _ => null,
  };
}

/// ScreenNotifications: « Nouveau » then « Plus tôt », with « Tout lire ».
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final page = ref.watch(notificationsProvider);
    final items = page.value?.items ?? const [];
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.bg,
        surfaceTintColor: colors.bg,
        elevation: 0,
        title: Text(l10n.notificationsTitle, style: DtType.title.copyWith(color: colors.ink)),
        actions: [
          if ((page.value?.unreadCount ?? 0) > 0)
            TextButton(
              onPressed: () => ref.read(notificationsProvider.notifier).markAllRead(),
              child: Text(l10n.notificationsMarkAllRead, style: DtType.label.copyWith(color: colors.brand)),
            ),
        ],
      ),
      body: page.isLoading && !page.hasValue
          ? const SkeletonRows()
          : page.hasError && !page.hasValue
          ? Padding(
              padding: const EdgeInsets.all(DtSpace.s4),
              child: Column(
                children: [
                  DtAlert(
                    severity: DtAlertSeverity.neutral,
                    body: commonErrorText(context, ApiError.from(page.error!)),
                  ),
                  const SizedBox(height: DtSpace.s3),
                  DtButton(
                    label: l10n.commonRetry,
                    variant: DtButtonVariant.secondary,
                    onPressed: () => ref.invalidate(notificationsProvider),
                  ),
                ],
              ),
            )
          : items.isEmpty
          ? Center(
              child: Text(l10n.notificationsEmpty, style: DtType.body.copyWith(color: colors.inkMuted)),
            )
          : RefreshIndicator(
              onRefresh: () => ref.refresh(notificationsProvider.future),
              child: ListView.separated(
                itemCount: items.length,
                separatorBuilder: (_, _) => Divider(height: DtBorder.hairline, color: colors.border),
                itemBuilder: (context, index) {
                  final item = items[index];
                  final text = notificationText(l10n, item);
                  if (text == null) return const SizedBox.shrink();
                  final unread = item.readAt == null;
                  return ListTile(
                    leading: Icon(
                      unread ? LucideIcons.bellDot : LucideIcons.bell,
                      color: unread ? colors.brand : colors.inkMuted,
                    ),
                    title: Text(text, style: (unread ? DtType.bodyStrong : DtType.body).copyWith(color: colors.ink)),
                    subtitle: Text(
                      dateText(context, item.createdAt),
                      style: DtType.caption.copyWith(color: colors.inkMuted),
                    ),
                    onTap: unread ? () => ref.read(notificationsProvider.notifier).markRead(item.id) : null,
                  );
                },
              ),
            ),
    );
  }
}
