import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/generated/models/legal_dto.dart';
import '../../core/api/generated/models/place_dto.dart';
import '../../core/api/generated/models/specialty_dto.dart';
import '../../core/api/generated/models/wilaya_dto.dart';

/// Public lists behind the pickers of sign-up and verification (never typed free text).

final wilayasProvider = FutureProvider<List<WilayaDto>>(
  (ref) => ref.watch(apiProvider).account.usersControllerListWilayas(),
);

/// Current terms version and legal page links for sign-up.
final legalProvider = FutureProvider<LegalDto>((ref) => ref.watch(apiProvider).account.usersControllerLegal());

final specialtiesProvider = FutureProvider<List<SpecialtyDto>>(
  (ref) => ref.watch(apiProvider).account.referenceDataControllerSpecialties(),
);

final institutionsProvider = FutureProvider<List<PlaceDto>>(
  (ref) => ref.watch(apiProvider).account.referenceDataControllerInstitutions(),
);

final universitiesProvider = FutureProvider<List<PlaceDto>>(
  (ref) => ref.watch(apiProvider).account.referenceDataControllerUniversities(),
);
