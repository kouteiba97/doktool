import 'package:doktool/src/core/api/api_client.dart';
import 'package:doktool/src/core/storage/secure_store.dart';
import 'package:doktool/src/features/settings/app_settings.dart';
import 'package:doktool/src/l10n/generated/app_localizations.dart';
import 'package:doktool/src/theme/doktool_tokens.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/test_app.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('theme', () {
    test('both themes carry their token extensions', () {
      final light = dtTheme(Brightness.light);
      final dark = dtTheme(Brightness.dark);
      expect(light.extension<DtColors>(), DtColors.light);
      expect(dark.extension<DtColors>(), DtColors.dark);
      expect(light.extension<DtElevation>(), DtElevation.light);
      expect(light.colorScheme.primary, DtColors.light.brand);
      expect(dark.colorScheme.primary, DtColors.dark.brand);
      expect(light.textTheme.bodyMedium?.fontFamily, 'Inter');
    });

    test('the result and numeric styles use tabular figures', () {
      expect(DtType.result.fontFeatures, contains(const FontFeature.tabularFigures()));
      expect(DtType.numeric.fontFeatures, contains(const FontFeature.tabularFigures()));
      expect(DtType.mono.fontFamily, 'JetBrainsMono');
    });
  });

  group('language', () {
    test('defaults to French unless the device is English', () {
      expect(AppLanguage.fromDevice(const Locale('fr', 'DZ')), AppLanguage.fr);
      expect(AppLanguage.fromDevice(const Locale('ar', 'DZ')), AppLanguage.fr);
      expect(AppLanguage.fromDevice(const Locale('en', 'US')), AppLanguage.en);
    });

    test('offers exactly French and English', () {
      expect(AppLocalizations.supportedLocales.map((l) => l.languageCode).toSet(), {'fr', 'en'});
    });
  });

  group('local database', () {
    test('reads back what it writes, and overwrites by key', () async {
      final database = memoryDatabase();
      addTearDown(database.close);
      expect(await database.readSetting('language'), isNull);
      await database.writeSetting('language', 'fr');
      await database.writeSetting('language', 'en');
      expect(await database.readSetting('language'), 'en');
    });
  });

  group('secure storage', () {
    test('creates the installation id once and keeps it', () async {
      FlutterSecureStorage.setMockInitialValues({});
      final store = SecureStore(const FlutterSecureStorage());
      final first = await store.installationId();
      expect(first, matches(RegExp(r'^[0-9a-f-]{36}$')));
      expect(await store.installationId(), first);
    });
  });

  group('API client', () {
    test('sends the interface language', () async {
      final options = RequestOptions(path: '/v1/health');
      final handler = _CapturingHandler();
      AcceptLanguageInterceptor(() => 'en').onRequest(options, handler);
      expect(handler.forwarded?.headers['Accept-Language'], 'en');
    });
  });
}

class _CapturingHandler extends RequestInterceptorHandler {
  RequestOptions? forwarded;

  @override
  void next(RequestOptions requestOptions) => forwarded = requestOptions;
}
