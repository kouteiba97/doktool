import '../../core/api/generated/models/client_analytics_event_type.dart';
import '../../core/api/generated/models/demo_context.dart';
import '../../core/api/generated/models/favorite_target_type.dart';
import '../../core/api/generated/models/reference_document_type.dart';
import '../../core/api/generated/models/search_type.dart';

/// Screens a demo can open or be stopped at (DEMO_FEATURE_VIEWED `module`, API `DEMO_MODULES`).
enum DemoModule { home, search, library, reference, calculator, favorites, offline, subscription, profile }

/// The two blocks of a pregnancy · lactation profile (PREGNANCY_VIEWED `section`).
enum PregnancySection { pregnancy, lactation }

/// The plan screens SUBSCRIPTION_VIEWED reports.
enum SubscriptionScreen { plans, subscription, review }

/// One analytics event of the V1 vocabulary (section 16). Only the named constructors build one,
/// each with exactly the properties the API accepts for its type: counts, codes and flags — never
/// free text, a query, a calculator input or a PDF's content (Lock L42). The server adds the
/// envelope (who, tier, platform) itself.
final class AnalyticsEvent {
  const AnalyticsEvent._(this.type, this.properties, {this.entityId});

  /// A search returned (debounced): how many results and which kinds — not the words.
  factory AnalyticsEvent.searchPerformed({required int resultCount, required Iterable<SearchType> groups}) {
    final targets = <String>{
      for (final group in groups)
        if (group == SearchType.calculator)
          FavoriteTargetType.calculator.json!
        else if (group == SearchType.ordonnance || group == SearchType.certificate)
          FavoriteTargetType.referenceDocument.json!,
    };
    return AnalyticsEvent._(ClientAnalyticsEventType.searchPerformed, {
      'resultCount': resultCount,
      'groups': targets.toList()..sort(),
    });
  }

  /// A search inside one library section.
  factory AnalyticsEvent.referenceSearched({required ReferenceDocumentType referenceType, required int resultCount}) =>
      AnalyticsEvent._(ClientAnalyticsEventType.referenceSearched, {
        'referenceType': referenceType.json,
        'resultCount': resultCount,
      });

  /// A reference row was tapped.
  factory AnalyticsEvent.referenceOpened({required String id, required ReferenceDocumentType referenceType}) =>
      AnalyticsEvent._(ClientAnalyticsEventType.referenceOpened, {'referenceType': referenceType.json}, entityId: id);

  /// The PDF was rendered, from the network or from the offline copy.
  factory AnalyticsEvent.referenceViewed({required String id, required int fileVersion, required bool offline}) =>
      AnalyticsEvent._(ClientAnalyticsEventType.referenceViewed, {
        'fileVersion': fileVersion,
        'source': offline ? 'offline' : 'online',
      }, entityId: id);

  /// A calculator was opened on a published version.
  factory AnalyticsEvent.calculatorStarted({required String id, required int version}) =>
      AnalyticsEvent._(ClientAnalyticsEventType.calculatorStarted, {'version': version}, entityId: id);

  /// A valid result was shown: the version, the interpretation band code and the engine — never
  /// the values entered.
  factory AnalyticsEvent.calculatorCompleted({
    required String id,
    required int version,
    required String? resultBand,
    required String engine,
  }) => AnalyticsEvent._(ClientAnalyticsEventType.calculatorCompleted, {
    'version': version,
    'resultBand': resultBand != null && _bandCode.hasMatch(resultBand) ? resultBand : null,
    'engine': engine,
  }, entityId: id);

  /// The star was set or cleared.
  factory AnalyticsEvent.favorite({required String id, required FavoriteTargetType targetType, required bool added}) =>
      AnalyticsEvent._(added ? ClientAnalyticsEventType.favoriteAdded : ClientAnalyticsEventType.favoriteRemoved, {
        'targetType': targetType.json,
      }, entityId: id);

  /// A pregnancy · lactation profile was read on one of its two blocks (ADR-019).
  factory AnalyticsEvent.pregnancyViewed({
    required String id,
    required PregnancySection section,
    required int version,
  }) => AnalyticsEvent._(ClientAnalyticsEventType.pregnancyViewed, {
    'section': section.name,
    'version': version,
  }, entityId: id);

  /// A plan screen was shown.
  factory AnalyticsEvent.subscriptionViewed(SubscriptionScreen screen) =>
      AnalyticsEvent._(ClientAnalyticsEventType.subscriptionViewed, {'screen': screen.name});

  /// A demo session was created (demo sessions only).
  factory AnalyticsEvent.demoStarted(DemoContext demoContext) =>
      AnalyticsEvent._(ClientAnalyticsEventType.demoStarted, {'demoContext': demoContext.json});

  /// The demo opened a module, or met its limit there (demo sessions only).
  factory AnalyticsEvent.demoFeatureViewed(DemoModule module, {required bool locked}) =>
      AnalyticsEvent._(ClientAnalyticsEventType.demoFeatureViewed, {'module': module.name, 'locked': locked});

  final ClientAnalyticsEventType type;
  final String? entityId;
  final Map<String, Object?> properties;

  static final _bandCode = RegExp(r'^[A-Z][A-Z0-9_]{0,39}$');
  static final _engine = RegExp(r'^(ts|dart)-\d+\.\d+\.\d+$');
  static final _uuid = RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', caseSensitive: false);

  /// Types only a demo session may send.
  static const demoOnly = {ClientAnalyticsEventType.demoStarted, ClientAnalyticsEventType.demoFeatureViewed};

  /// Whether the API will accept it: the same rules as `CLIENT_EVENTS` (analytics.policy.ts), so a
  /// value the app could not express (an unknown enum, a negative count) is dropped on the device.
  bool get isValid {
    bool count(Object? value) => value is int && value >= 0 && value <= 100000;
    bool version(Object? value) => value is int && value >= 1 && value <= 100000;
    bool oneOf(Object? value, Iterable<Object?> allowed) => value != null && allowed.contains(value);
    final referenceTypes = [ReferenceDocumentType.ordonnance.json, ReferenceDocumentType.certificate.json];
    final targetTypes = [FavoriteTargetType.referenceDocument.json, FavoriteTargetType.calculator.json];
    final p = properties;
    final keysOk = switch (type) {
      ClientAnalyticsEventType.searchPerformed =>
        count(p['resultCount']) &&
            p['groups'] is List &&
            (p['groups'] as List).length <= 2 &&
            (p['groups'] as List).every((group) => oneOf(group, targetTypes)),
      ClientAnalyticsEventType.referenceSearched =>
        oneOf(p['referenceType'], referenceTypes) && count(p['resultCount']),
      ClientAnalyticsEventType.referenceOpened => oneOf(p['referenceType'], referenceTypes),
      ClientAnalyticsEventType.referenceViewed =>
        version(p['fileVersion']) && oneOf(p['source'], ['online', 'offline']),
      ClientAnalyticsEventType.calculatorStarted => version(p['version']),
      ClientAnalyticsEventType.calculatorCompleted =>
        version(p['version']) &&
            (p['resultBand'] == null ||
                (p['resultBand'] is String && _bandCode.hasMatch(p['resultBand']! as String))) &&
            p['engine'] is String &&
            _engine.hasMatch(p['engine']! as String),
      ClientAnalyticsEventType.favoriteAdded ||
      ClientAnalyticsEventType.favoriteRemoved => oneOf(p['targetType'], targetTypes),
      ClientAnalyticsEventType.subscriptionViewed => oneOf(
        p['screen'],
        SubscriptionScreen.values.map((screen) => screen.name),
      ),
      ClientAnalyticsEventType.demoStarted => oneOf(p['demoContext'], [
        DemoContext.doctor.json,
        DemoContext.resident.json,
      ]),
      ClientAnalyticsEventType.demoFeatureViewed =>
        oneOf(p['module'], DemoModule.values.map((module) => module.name)) && p['locked'] is bool,
      ClientAnalyticsEventType.pregnancyViewed =>
        oneOf(p['section'], PregnancySection.values.map((section) => section.name)) && version(p['version']),
      ClientAnalyticsEventType.$unknown => false,
    };
    return keysOk && (entityId == null ? !_hasEntity : _hasEntity && _uuid.hasMatch(entityId!));
  }

  bool get _hasEntity => switch (type) {
    ClientAnalyticsEventType.referenceOpened ||
    ClientAnalyticsEventType.referenceViewed ||
    ClientAnalyticsEventType.calculatorStarted ||
    ClientAnalyticsEventType.calculatorCompleted ||
    ClientAnalyticsEventType.favoriteAdded ||
    ClientAnalyticsEventType.favoriteRemoved ||
    ClientAnalyticsEventType.pregnancyViewed => true,
    _ => false,
  };
}
