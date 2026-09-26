import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/api/generated/models/me_dto.dart';
import '../../core/api/generated/models/professional_type.dart';
import '../../core/api/generated/models/set_professional_profile_dto.dart';
import '../../core/auth/session.dart';
import '../../core/auth/session_controller.dart';
import '../../core/database/app_database.dart';

/// What the app keeps about the signed-in person, cached on the device so a signed-in device
/// opens offline (ScreenWelcome « offline » state).
@immutable
class AccountSummary {
  const AccountSummary({required this.userId, required this.firstName, required this.lastName, this.professionalType});

  factory AccountSummary.fromMe(MeDto me) => AccountSummary(
    userId: me.id,
    firstName: me.firstName,
    lastName: me.lastName,
    professionalType: me.professionalProfile?.professionalType,
  );

  factory AccountSummary.fromJson(Map<String, Object?> json) => AccountSummary(
    userId: json['userId']! as String,
    firstName: json['firstName']! as String,
    lastName: json['lastName']! as String,
    professionalType: json['professionalType'] == null
        ? null
        : ProfessionalType.fromJson(json['professionalType']! as String),
  );

  final String userId;
  final String firstName;
  final String lastName;

  /// Null until « Qui êtes-vous ? » is answered.
  final ProfessionalType? professionalType;

  Map<String, Object?> toJson() => {
    'userId': userId,
    'firstName': firstName,
    'lastName': lastName,
    'professionalType': professionalType?.toJson(),
  };
}

/// The signed-in account, or null for a demo or signed-out device.
class AccountController extends AsyncNotifier<AccountSummary?> {
  static const _cacheKey = 'account.summary';

  @override
  Future<AccountSummary?> build() async {
    final session = ref.watch(sessionControllerProvider).value;
    if (session is! UserSession) return null;
    final database = ref.read(appDatabaseProvider);
    try {
      final summary = AccountSummary.fromMe(await ref.read(apiProvider).account.usersControllerMe());
      await database.writeSetting(_cacheKey, jsonEncode(summary.toJson()));
      return summary;
    } catch (error) {
      final cached = await database.readSetting(_cacheKey);
      if (ApiError.from(error).isNetwork && cached != null) {
        return AccountSummary.fromJson(jsonDecode(cached) as Map<String, Object?>);
      }
      rethrow;
    }
  }

  /// « Qui êtes-vous ? »: records the professional type once (a later change is a re-verification).
  Future<void> setProfessionalType(ProfessionalType type) async {
    await ref
        .read(apiProvider)
        .account
        .usersControllerSetProfessionalProfile(body: SetProfessionalProfileDto(professionalType: type));
    ref.invalidateSelf();
    await future;
  }

  Future<void> reload() async {
    ref.invalidateSelf();
    await future;
  }
}

final accountControllerProvider = AsyncNotifierProvider<AccountController, AccountSummary?>(AccountController.new);
