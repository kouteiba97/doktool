import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'src/app.dart';
import 'src/core/api/provider_retry.dart';

void main() {
  runApp(const ProviderScope(retry: providerRetry, child: DokToolApp()));
}
