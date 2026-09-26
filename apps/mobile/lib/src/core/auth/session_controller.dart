import 'dart:io' show Platform;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/settings/app_settings.dart';
import '../../features/settings/settings_controller.dart';
import '../api/api_client.dart';
import '../api/generated/models/auth_tokens_dto.dart';
import '../api/generated/models/demo_context.dart';
import '../api/generated/models/device_dto.dart';
import '../api/generated/models/device_platform.dart';
import '../api/generated/models/language.dart';
import '../api/generated/models/start_demo_dto.dart';
import '../storage/secure_store.dart';
import 'session.dart';
import 'session_vault.dart';

/// The current [Session], restored from secure storage at launch. The router follows it.
class SessionController extends AsyncNotifier<Session> {
  SessionVault get _vault => ref.read(sessionVaultProvider);

  @override
  Future<Session> build() async {
    final vault = ref.watch(sessionVaultProvider);
    vault.onSessionEnded = () => state = const AsyncData(SignedOut());
    return vault.restore();
  }

  /// Stores the tokens of a confirmed sign-up or a sign-in, without switching the app yet, so the
  /// caller can finish onboarding calls first. Call [enter] afterwards.
  Future<UserSession> store(AuthTokensDto tokens) => _vault.saveUser(tokens);

  /// Switches the app to the stored session.
  void enter() => state = AsyncData(_vault.session);

  Future<void> startDemo(DemoContext context) async {
    final deviceId = await ref.read(secureStoreProvider).installationId();
    final demo = await ref
        .read(apiProvider)
        .demo
        .demoControllerStart(
          body: StartDemoDto(demoContext: context, deviceId: deviceId),
        );
    state = AsyncData(await _vault.saveDemo(demo));
  }

  /// Signs out on the server when reachable, and always on the device.
  Future<void> signOut() async {
    if (_vault.session is UserSession) {
      try {
        await ref.read(apiProvider).auth.authControllerSignOut();
      } catch (_) {
        // The device forgets the session anyway; the server session expires on its own.
      }
    }
    await _vault.clear();
    state = const AsyncData(SignedOut());
  }

  /// The device descriptor sent at sign-in and sign-up confirmation (sessions are device-bound).
  Future<DeviceDto> device() async => DeviceDto(
    id: await ref.read(secureStoreProvider).installationId(),
    platform: Platform.isIOS ? DevicePlatform.ios : DevicePlatform.android,
    name: Platform.isIOS ? 'iPhone' : 'Android',
  );

  /// The interface language, for server texts (OTP messages).
  Language language() =>
      ref.read(settingsControllerProvider).value?.language == AppLanguage.en ? Language.en : Language.fr;
}

final sessionControllerProvider = AsyncNotifierProvider<SessionController, Session>(SessionController.new);
