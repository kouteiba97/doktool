import 'package:doktool/src/core/database/app_database.dart';
import 'package:doktool/src/features/settings/settings_controller.dart';
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:go_router/go_router.dart';

/// A fresh in-memory database per test (no files, no platform channels).
AppDatabase memoryDatabase() =>
    AppDatabase(DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));

/// Provider overrides for widget and unit tests.
List<Override> testOverrides({required AppDatabase database, Locale deviceLocale = const Locale('fr')}) => [
  appDatabaseProvider.overrideWithValue(database),
  deviceLocaleProvider.overrideWithValue(deviceLocale),
];

/// A router showing one screen, for tests of a screen inside the real app shell (themes, locales)
/// without the session restore of the launch route.
GoRouter singleScreenRouter(Widget screen) => GoRouter(
  routes: [GoRoute(path: '/', builder: (context, state) => screen)],
);
