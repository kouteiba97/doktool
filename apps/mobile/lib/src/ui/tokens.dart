import 'package:flutter/material.dart';

import '../theme/doktool_tokens.dart';

/// Token access from widgets: `context.colors.brand`. Widgets never use raw colours, radii,
/// blur or durations (Lock L35).
extension DtContext on BuildContext {
  DtColors get colors => Theme.of(this).extension<DtColors>()!;
  DtElevation get elevation => Theme.of(this).extension<DtElevation>()!;
}
