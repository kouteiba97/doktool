import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/session.dart';
import '../../core/auth/session_controller.dart';
import '../../core/network/connectivity.dart';
import '../../router/app_router.dart';
import '../activity/activity_recorder.dart';
import 'analytics_event.dart';
import 'analytics_recorder.dart';

/// The plan screen a location shows, for SUBSCRIPTION_VIEWED.
@visibleForTesting
SubscriptionScreen? subscriptionScreenFor(String location) {
  if (location == Routes.plans) return SubscriptionScreen.plans;
  if (location == Routes.subscription) return SubscriptionScreen.subscription;
  if (location.startsWith('/subscription/review/')) return SubscriptionScreen.review;
  return null;
}

/// The module a location belongs to, for DEMO_FEATURE_VIEWED.
@visibleForTesting
DemoModule? demoModuleFor(String location) {
  if (location == Routes.home) return DemoModule.home;
  if (location == Routes.search) return DemoModule.search;
  if (location.startsWith('/library/')) return DemoModule.library;
  if (location.startsWith('/reference/')) return DemoModule.reference;
  if (location.startsWith('/calculators/')) return DemoModule.calculator;
  if (location == Routes.profileActivity) return DemoModule.favorites;
  if (location == Routes.offlineSettings) return DemoModule.offline;
  if (location.startsWith('/subscription')) return DemoModule.subscription;
  if (location == Routes.profile || location == Routes.settings) return DemoModule.profile;
  return null;
}

/// The location on screen, pushed routes included.
String? currentLocation(GoRouter router) => router.routerDelegate.currentConfiguration.lastOrNull?.matchedLocation;

/// A demo met its limit (the lock sheet of a demo-locked item), counted against the module shown.
void recordDemoLimit(BuildContext context) {
  final router = GoRouter.maybeOf(context);
  final module = router == null ? null : demoModuleFor(currentLocation(router) ?? '');
  if (module == null) return;
  ProviderScope.containerOf(
    context,
    listen: false,
  ).read(analyticsRecorderProvider).record(AnalyticsEvent.demoFeatureViewed(module, locked: true));
}

/// Sends what the device holds — analytics and the research history — when the app comes back,
/// goes to the background or finds the network again, and reports screen views that need no
/// widget of their own: the plan screens and, in a demo, each module opened.
class AnalyticsHost extends ConsumerStatefulWidget {
  const AnalyticsHost({required this.child, super.key});

  final Widget child;

  @override
  ConsumerState<AnalyticsHost> createState() => _AnalyticsHostState();
}

class _AnalyticsHostState extends ConsumerState<AnalyticsHost> with WidgetsBindingObserver {
  late final GoRouter _router = ref.read(routerProvider);
  String? _location;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _router.routerDelegate.addListener(_routeChanged);
  }

  @override
  void dispose() {
    _router.routerDelegate.removeListener(_routeChanged);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed || state == AppLifecycleState.paused) _send();
  }

  void _send() {
    unawaited(ref.read(analyticsRecorderProvider).flush());
    unawaited(ref.read(activityRecorderProvider).flush());
  }

  void _routeChanged() {
    final location = currentLocation(_router);
    if (location == null || location == _location) return;
    _location = location;
    final recorder = ref.read(analyticsRecorderProvider);
    final screen = subscriptionScreenFor(location);
    if (screen != null) recorder.record(AnalyticsEvent.subscriptionViewed(screen));
    if (ref.read(sessionControllerProvider).value is DemoSession) {
      final module = demoModuleFor(location);
      if (module != null) recorder.record(AnalyticsEvent.demoFeatureViewed(module, locked: false));
    }
  }

  @override
  Widget build(BuildContext context) {
    ref
      ..listen(isOnlineProvider, (wasOnline, online) {
        if (wasOnline == false && online) _send();
      })
      ..listen(sessionControllerProvider, (previous, next) {
        // A new session starts with its own queue; whatever is waiting for it goes now.
        if (previous?.value != next.value) _send();
      });
    return widget.child;
  }
}
