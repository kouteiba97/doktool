import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
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
  final locale = l10n.localeName;
  final caseType = notification.params['caseType'] ?? '';
  return switch (notification.messageKey) {
    'mobile.notifications.verificationApproved' => l10n.notificationsVerificationApproved(caseType),
    'mobile.notifications.verificationRejected' => l10n.notificationsVerificationRejected(caseType),
    'mobile.notifications.verificationExpiring' => l10n.notificationsVerificationExpiring(
      caseType,
      notification.params['days'] ?? '',
    ),
    'mobile.notifications.verificationExpired' => l10n.notificationsVerificationExpired(caseType),
    'mobile.notifications.subscriptionActivated' => l10n.notificationsSubscriptionActivated,
    'mobile.notifications.subscriptionEnded' => l10n.notificationsSubscriptionEnded,
    'mobile.notifications.subscriptionGrace' => l10n.notificationsSubscriptionGrace(
      _date(locale, notification.params['graceEndsAt']),
    ),
    'mobile.notifications.subscriptionRenewal' => l10n.notificationsSubscriptionRenewal(
      _date(locale, notification.params['endsAt']),
    ),
    'mobile.notifications.securityPasswordChanged' => l10n.notificationsSecurityPasswordChanged,
    'mobile.notifications.securityContactAdded' => l10n.notificationsSecurityContactAdded(
      notification.params['channel'] ?? '',
    ),
    'mobile.notifications.securityContactRemoved' => l10n.notificationsSecurityContactRemoved(
      notification.params['channel'] ?? '',
    ),
    'mobile.notifications.securityRecoveryRequested' => l10n.notificationsSecurityRecoveryRequested,
    'mobile.notifications.securityRecoveryApproved' => l10n.notificationsSecurityRecoveryApproved(
      _date(locale, notification.params['date']),
    ),
    _ => null,
  };
}

/// An ISO date parameter in the person's language (« 12 octobre 2026 »).
String _date(String locale, String? iso) {
  final parsed = iso == null ? null : DateTime.tryParse(iso);
  return parsed == null ? '' : DateFormat.yMMMMd(locale).format(parsed.toLocal());
}

/// ScreenNotifications: « Nouveau » then « Plus tôt », with « Tout lire ». The list is fetched
/// again each time the screen opens (the bell's count may be from earlier) and on pull.
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.invalidate(notificationsProvider));
  }

  @override
  Widget build(BuildContext context) {
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
          ? RefreshIndicator(
              onRefresh: () => ref.refresh(notificationsProvider.future),
              child: ListView(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(DtSpace.s12),
                    child: Text(
                      l10n.notificationsEmpty,
                      textAlign: TextAlign.center,
                      style: DtType.body.copyWith(color: colors.inkMuted),
                    ),
                  ),
                ],
              ),
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
