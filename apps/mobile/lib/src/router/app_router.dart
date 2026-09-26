import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/auth/session.dart';
import '../core/auth/session_controller.dart';
import '../features/account/account_controller.dart';
import '../features/calculators/calculator_screen.dart';
import '../features/home/home_screen.dart';
import '../features/library/library_data.dart';
import '../features/library/library_screen.dart';
import '../features/notifications/notifications_screen.dart';
import '../features/onboarding/demo_start_screen.dart';
import '../features/onboarding/onboarding_draft.dart';
import '../features/onboarding/otp_screen.dart';
import '../features/onboarding/password_reset_screens.dart';
import '../features/onboarding/role_select_screen.dart';
import '../features/onboarding/sign_in_screen.dart';
import '../features/onboarding/sign_up_screen.dart';
import '../features/onboarding/welcome_screen.dart';
import '../features/profile/profile_screen.dart';
import '../features/reference/reference_viewer_screen.dart';
import '../features/search/search_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/shell/app_shell.dart';
import '../features/verification/identity_step_screen.dart';
import '../features/verification/status_step_screen.dart';
import '../features/verification/summary_screen.dart';
import '../features/verification/verification_intro_screen.dart';
import '../features/verification/verification_status_screen.dart';
import '../ui/dt_logo.dart';
import '../ui/tokens.dart';
import '../features/activity/activity_screen.dart';
import '../features/profile/edit_profile_screen.dart';
import '../features/subscription/payment_result_screen.dart';
import '../features/subscription/plans_screen.dart';
import '../features/subscription/review_screen.dart';
import '../features/subscription/subscription_screen.dart';
import '../features/offline/offline_settings_screen.dart';

/// Route map of audit §11. Guards read the session and the account; locked content is never
/// hidden by a guard — it renders its locked state (section 27).
abstract final class Routes {
  static const launch = '/';
  static const welcome = '/welcome';
  static const demoStart = '/demo/start';
  static const signIn = '/auth/sign-in';
  static const signUp = '/auth/sign-up';
  static const otp = '/auth/otp';
  static const resetRequest = '/auth/reset';
  static const resetConfirm = '/auth/reset/confirm';
  static const role = '/onboarding/role';
  static const verificationIntro = '/verification/intro';
  static const verificationIdentity = '/verification/identity';
  static const verificationStatusStep = '/verification/professional';
  static const verificationSummary = '/verification/summary';
  static const verificationStatus = '/verification/status';
  static const home = '/home';
  static const search = '/search';
  static const profile = '/profile';
  static const settings = '/settings';
  static const offlineSettings = '/settings/offline';
  static const notifications = '/notifications';
  static const plans = '/subscription/plans';
  static const subscription = '/subscription';
  static const profileActivity = '/profile/activity';
  static const profileEdit = '/profile/edit';

  static String library(LibrarySection section) => '/library/${section.slug}';
  static String reference(String id) => '/reference/$id';
  static String calculator(String slug) => '/calculators/$slug';
  static String subscriptionReview(String planId) => '/subscription/review/$planId';
  static String subscriptionResult(String transactionId) => '/subscription/result/$transactionId';

  /// Reachable while signed out.
  static const public = {welcome, demoStart, signIn, signUp, otp, resetRequest, resetConfirm, role};

  /// Only for real accounts (never a demo token, section 27).
  static const accountOnly = [
    '/verification',
    notifications,
    '/subscription/review',
    '/subscription/result',
    '/profile/',
  ];
}

/// Re-runs the redirect when the session or the account changes.
class _RouterRefresh extends ChangeNotifier {
  _RouterRefresh(Ref ref) {
    ref
      ..listen(sessionControllerProvider, (_, _) => notifyListeners())
      ..listen(accountControllerProvider, (_, _) => notifyListeners());
  }
}

/// Where the router sends a viewer, or null to stay.
@visibleForTesting
String? redirectFor({
  required String location,
  required AsyncValue<Session> session,
  required AsyncValue<AccountSummary?> account,
  required String? afterSignIn,
}) {
  final current = session.value;
  if (current == null) return location == Routes.launch ? null : Routes.launch;
  final isPublic = Routes.public.contains(location);
  switch (current) {
    case SignedOut():
      return isPublic ? null : Routes.welcome;
    case DemoSession():
      final accountOnly = location == Routes.subscription || Routes.accountOnly.any(location.startsWith);
      return location == Routes.launch || isPublic || accountOnly ? Routes.home : null;
    case UserSession():
      final summary = account.value;
      if (summary == null) {
        // Still loading (or unreachable with no cached copy): wait on the launch screen only when
        // coming from a signed-out page.
        if (account.isLoading) {
          return location == Routes.launch || (isPublic && location != Routes.role) ? Routes.launch : null;
        }
        return location == Routes.launch || isPublic ? Routes.home : null;
      }
      if (summary.professionalType == null) return location == Routes.role ? null : Routes.role;
      if (location == Routes.launch || isPublic) return afterSignIn ?? Routes.home;
      return null;
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefresh(ref);
  final router = GoRouter(
    initialLocation: Routes.launch,
    refreshListenable: refresh,
    redirect: (context, state) => redirectFor(
      location: state.matchedLocation,
      session: ref.read(sessionControllerProvider),
      account: ref.read(accountControllerProvider),
      afterSignIn: ref.read(onboardingDraftProvider).afterSignIn,
    ),
    routes: [
      GoRoute(path: Routes.launch, builder: (context, state) => const _LaunchScreen()),
      GoRoute(path: Routes.welcome, builder: (context, state) => const WelcomeScreen()),
      GoRoute(path: Routes.demoStart, builder: (context, state) => const DemoStartScreen()),
      GoRoute(path: Routes.signIn, builder: (context, state) => const SignInScreen()),
      GoRoute(path: Routes.signUp, builder: (context, state) => const SignUpScreen()),
      GoRoute(path: Routes.otp, builder: (context, state) => const OtpScreen()),
      GoRoute(path: Routes.resetRequest, builder: (context, state) => const ResetRequestScreen()),
      GoRoute(path: Routes.resetConfirm, builder: (context, state) => const ResetConfirmScreen()),
      GoRoute(path: Routes.role, builder: (context, state) => const RoleSelectScreen()),
      GoRoute(path: Routes.verificationIntro, builder: (context, state) => const VerificationIntroScreen()),
      GoRoute(path: Routes.verificationIdentity, builder: (context, state) => const IdentityStepScreen()),
      GoRoute(path: Routes.verificationStatusStep, builder: (context, state) => const StatusStepScreen()),
      GoRoute(path: Routes.verificationSummary, builder: (context, state) => const SummaryScreen()),
      GoRoute(path: Routes.verificationStatus, builder: (context, state) => const VerificationStatusScreen()),
      GoRoute(path: Routes.search, builder: (context, state) => const SearchScreen()),
      GoRoute(path: Routes.settings, builder: (context, state) => const SettingsScreen()),
      GoRoute(path: Routes.offlineSettings, builder: (context, state) => const OfflineSettingsScreen()),
      GoRoute(path: Routes.notifications, builder: (context, state) => const NotificationsScreen()),
      GoRoute(path: Routes.plans, builder: (context, state) => const PlansScreen()),
      GoRoute(path: Routes.subscription, builder: (context, state) => const SubscriptionScreen()),
      GoRoute(
        path: '/subscription/review/:planId',
        builder: (context, state) => ReviewScreen(planId: state.pathParameters['planId']!),
      ),
      GoRoute(
        path: '/subscription/result/:transactionId',
        builder: (context, state) => PaymentResultScreen(transactionId: state.pathParameters['transactionId']!),
      ),
      GoRoute(path: Routes.profileActivity, builder: (context, state) => const ActivityScreen()),
      GoRoute(path: Routes.profileEdit, builder: (context, state) => const EditProfileScreen()),
      GoRoute(
        path: '/reference/:id',
        builder: (context, state) => ReferenceViewerScreen(id: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/calculators/:slug',
        builder: (context, state) => CalculatorScreen(slug: state.pathParameters['slug']!),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => AppShell(navigationShell: shell),
        branches: [
          StatefulShellBranch(
            routes: [GoRoute(path: Routes.home, builder: (context, state) => const HomeScreen())],
          ),
          StatefulShellBranch(
            initialLocation: Routes.library(LibrarySection.ordonnances),
            routes: [
              GoRoute(
                path: '/library/:section',
                builder: (context, state) =>
                    LibraryScreen(section: LibrarySection.fromSlug(state.pathParameters['section'])),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: Routes.profile, builder: (context, state) => const ProfileScreen())],
          ),
        ],
      ),
    ],
  );
  ref.onDispose(() {
    router.dispose();
    refresh.dispose();
  });
  return router;
});

/// Shown while the session is restored from secure storage.
class _LaunchScreen extends StatelessWidget {
  const _LaunchScreen();

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: context.colors.bg,
    body: const Center(child: DtLogo(height: 120)),
  );
}
