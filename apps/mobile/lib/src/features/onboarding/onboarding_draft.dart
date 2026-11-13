import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/generated/models/otp_challenge_dto.dart';
import '../../core/api/generated/models/professional_type.dart';

/// Why a code was sent: confirming a sign-up or resetting a password.
enum OtpPurpose { signUp, passwordReset }

/// What onboarding remembers between its screens, in memory only (never persisted): the role
/// chosen before the account exists, and the pending OTP challenge.
@immutable
class OnboardingDraft {
  const OnboardingDraft({this.role, this.challenge, this.purpose, this.identifier, this.afterSignIn});

  /// « Qui êtes-vous ? » answered before sign-up; recorded once the account is confirmed.
  final ProfessionalType? role;
  final OtpChallengeDto? challenge;
  final OtpPurpose? purpose;
  final String? identifier;

  /// Where the router sends a newly signed-in person (the verification intro after sign-up).
  final String? afterSignIn;

  /// A copy with some fields changed.
  OnboardingDraft copyWith({
    ProfessionalType? role,
    OtpChallengeDto? challenge,
    OtpPurpose? purpose,
    String? identifier,
    String? afterSignIn,
  }) => OnboardingDraft(
    role: role ?? this.role,
    challenge: challenge ?? this.challenge,
    purpose: purpose ?? this.purpose,
    identifier: identifier ?? this.identifier,
    afterSignIn: afterSignIn ?? this.afterSignIn,
  );
}

/// Holds the draft while the person moves between onboarding screens.
class OnboardingDraftController extends Notifier<OnboardingDraft> {
  @override
  OnboardingDraft build() => const OnboardingDraft();

  /// Remembers the role picked before the account exists.
  void chooseRole(ProfessionalType role) => state = state.copyWith(role: role);

  /// A code was sent: remembers the challenge, its purpose and where it went.
  void awaitCode(OtpChallengeDto challenge, OtpPurpose purpose, String identifier) =>
      state = state.copyWith(challenge: challenge, purpose: purpose, identifier: identifier);

  /// Sign-up confirmed: keeps the role and where to go after signing in.
  void signedUp(String destination) => state = OnboardingDraft(role: state.role, afterSignIn: destination);

  /// Forgets everything once onboarding is over or abandoned.
  void reset() => state = const OnboardingDraft();
}

final onboardingDraftProvider = NotifierProvider<OnboardingDraftController, OnboardingDraft>(
  OnboardingDraftController.new,
);
