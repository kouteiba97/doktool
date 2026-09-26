import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/generated/app_localizations.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/segmented_control.dart';
import '../../ui/tokens.dart';
import 'app_settings.dart';
import 'settings_controller.dart';

/// « Paramètres » (ScreenSettings): appearance and language, applied instantly. The other sections
/// (notifications, security, data & offline, account, about, sign out) join with their phases.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final settings = ref.watch(settingsControllerProvider).value;
    final controller = ref.read(settingsControllerProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.settingsTitle, style: DtType.title.copyWith(color: colors.ink)),
        backgroundColor: colors.bg,
        surfaceTintColor: colors.bg,
        elevation: 0,
      ),
      body: settings == null
          ? const SizedBox.shrink()
          : ListView(
              padding: const EdgeInsets.all(DtSpace.s4),
              children: [
                _Section(
                  title: l10n.settingsAppearanceTitle,
                  child: DtSegmentedControl<AppearancePreference>(
                    semanticLabel: l10n.settingsAppearanceTitle,
                    selected: settings.appearance,
                    onChanged: controller.setAppearance,
                    segments: [
                      DtSegment(value: AppearancePreference.light, label: l10n.settingsAppearanceLight),
                      DtSegment(value: AppearancePreference.dark, label: l10n.settingsAppearanceDark),
                      DtSegment(value: AppearancePreference.system, label: l10n.settingsAppearanceSystem),
                    ],
                  ),
                ),
                const SizedBox(height: DtSpace.s6),
                _Section(
                  title: l10n.settingsLanguageTitle,
                  helper: l10n.settingsLanguageHelper,
                  child: DtSegmentedControl<AppLanguage>(
                    semanticLabel: l10n.settingsLanguageTitle,
                    selected: settings.language,
                    onChanged: controller.setLanguage,
                    segments: [
                      DtSegment(value: AppLanguage.fr, label: l10n.settingsLanguageFrench),
                      DtSegment(value: AppLanguage.en, label: l10n.settingsLanguageEnglish),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child, this.helper});

  final String title;
  final String? helper;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Container(
      padding: const EdgeInsets.all(DtSpace.s4),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(DtRadius.lg),
        border: Border.all(color: colors.border, width: DtBorder.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            header: true,
            child: Text(title, style: DtType.heading.copyWith(color: colors.ink)),
          ),
          const SizedBox(height: DtSpace.s3),
          child,
          if (helper != null) ...[
            const SizedBox(height: DtSpace.s2),
            Text(helper!, style: DtType.caption.copyWith(color: colors.inkSecondary)),
          ],
        ],
      ),
    );
  }
}
