import 'dart:typed_data';
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:pdfrx/pdfrx.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/api/generated/models/access_state.dart';
import '../../core/api/generated/models/reference_document_type.dart';
import '../../core/api/generated/models/reference_item_dto.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/content_row.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_button.dart';
import '../../ui/error_text.dart';
import '../../ui/locks.dart';
import '../../ui/tokens.dart';
import 'reference_files.dart';
import '../../core/api/generated/models/favorite_target_type.dart';
import '../activity/activity_recorder.dart';
import '../activity/favorite_button.dart';

/// A reference model and its PDF, checked against the published SHA-256.
class OpenedReference {
  const OpenedReference({required this.item, required this.bytes});

  final ReferenceItemDto item;
  final Uint8List bytes;
}

final openedReferenceProvider = FutureProvider.autoDispose.family<OpenedReference, String>((ref, id) async {
  final api = ref.watch(apiProvider).referenceLibrary;
  final item = await api.referenceLibraryControllerGet(id: id);
  if (item.access.state == AccessState.locked) return OpenedReference(item: item, bytes: Uint8List(0));
  final bytes = await ref.watch(referenceFilesProvider).bytesOf(item);
  return OpenedReference(item: item, bytes: bytes);
});

/// ScreenReferenceViewer: full-screen and read-only. The reference notice is pinned and never
/// dismissible. There is no export, print, share, download, generate, edit or patient-field control
/// (Lock L31), and text selection is off so nothing leaves the viewer.
class ReferenceViewerScreen extends ConsumerStatefulWidget {
  const ReferenceViewerScreen({required this.id, super.key});

  final String id;

  @override
  ConsumerState<ReferenceViewerScreen> createState() => _ReferenceViewerScreenState();
}

class _ReferenceViewerScreenState extends ConsumerState<ReferenceViewerScreen> {
  final _controller = PdfViewerController();
  int _page = 1;
  int _pages = 0;

  @override
  void initState() {
    super.initState();
    ref.read(activityRecorderProvider).referenceViewed(widget.id);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final opened = ref.watch(openedReferenceProvider(widget.id));
    final item = opened.value?.item;
    final type = item?.type == ReferenceDocumentType.certificate ? l10n.typesCertificate : l10n.typesOrdonnance;

    return Scaffold(
      backgroundColor: colors.surfaceSunken,
      appBar: AppBar(
        backgroundColor: colors.bg,
        surfaceTintColor: colors.bg,
        elevation: 0,
        leading: IconButton(
          tooltip: l10n.commonBack,
          icon: Icon(LucideIcons.chevronLeft, color: colors.ink),
          onPressed: () => context.pop(),
        ),
        title: item == null
            ? null
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    localizedTitle(context, item.titleFr, item.titleEn),
                    overflow: TextOverflow.ellipsis,
                    style: DtType.heading.copyWith(color: colors.ink),
                  ),
                  Text(
                    l10n.viewerMeta(type, dateText(context, item.fileDate)),
                    style: DtType.caption.copyWith(color: colors.inkSecondary),
                  ),
                ],
              ),
        actions: [
          if (item != null && item.access.state != AccessState.locked)
            FavoriteButton(type: FavoriteTargetType.referenceDocument, id: item.id),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(DtSpace.s8),
          child: Container(
            width: double.infinity,
            color: colors.surfaceSunken,
            padding: const EdgeInsets.symmetric(horizontal: DtSpace.s4, vertical: DtSpace.s2),
            child: Semantics(
              liveRegion: false,
              child: Text(l10n.viewerNotice, style: DtType.caption.copyWith(color: colors.inkSecondary)),
            ),
          ),
        ),
      ),
      body: opened.when(
        loading: () => const _PaperSkeleton(),
        error: (error, _) =>
            _Failure(error: ApiError.from(error), onRetry: () => ref.invalidate(openedReferenceProvider(widget.id))),
        data: (opened) {
          if (opened.item.access.state == AccessState.locked) {
            return Padding(
              padding: const EdgeInsets.all(DtSpace.s4),
              child: DtAlert(
                severity: DtAlertSeverity.neutral,
                title: lockWord(l10n, opened.item.access.lockReason),
                body: lockExplanation(l10n, opened.item.access.lockReason),
              ),
            );
          }
          return Stack(
            children: [
              PdfViewer.data(
                opened.bytes,
                sourceName: '${opened.item.id}-${opened.item.fileVersion}',
                controller: _controller,
                params: PdfViewerParams(
                  backgroundColor: colors.surfaceSunken,
                  textSelectionParams: const PdfTextSelectionParams(enabled: false),
                  onViewerReady: (document, controller) => setState(() => _pages = document.pages.length),
                  onPageChanged: (page) {
                    if (page != null) setState(() => _page = page);
                  },
                ),
              ),
              if (_pages > 0)
                Positioned(
                  bottom: DtSpace.s6,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: _ZoomControl(
                      page: _page,
                      pages: _pages,
                      onZoomIn: () => _controller.zoomUp(),
                      onZoomOut: () => _controller.zoomDown(),
                      onFit: () => _controller.goToPage(pageNumber: _page, anchor: PdfPageAnchor.all),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _ZoomControl extends StatelessWidget {
  const _ZoomControl({
    required this.page,
    required this.pages,
    required this.onZoomIn,
    required this.onZoomOut,
    required this.onFit,
  });

  final int page;
  final int pages;
  final VoidCallback onZoomIn;
  final VoidCallback onZoomOut;
  final VoidCallback onFit;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    return ClipRRect(
      borderRadius: BorderRadius.circular(DtRadius.full),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: DtBlur.glass, sigmaY: DtBlur.glass),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: DtSpace.s2),
          decoration: BoxDecoration(
            color: colors.glass,
            borderRadius: BorderRadius.circular(DtRadius.full),
            border: Border.all(color: colors.glassBorder, width: DtBorder.hairline),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(tooltip: l10n.viewerZoomOut, icon: const Icon(LucideIcons.zoomOut), onPressed: onZoomOut),
              IconButton(tooltip: l10n.viewerFit, icon: const Icon(LucideIcons.scan), onPressed: onFit),
              IconButton(tooltip: l10n.viewerZoomIn, icon: const Icon(LucideIcons.zoomIn), onPressed: onZoomIn),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: DtSpace.s2),
                child: Text(
                  l10n.viewerPage('$page', '$pages'),
                  style: DtType.label.copyWith(color: colors.ink, fontFeatures: const [FontFeature.tabularFigures()]),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PaperSkeleton extends StatelessWidget {
  const _PaperSkeleton();

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(DtSpace.s6),
        child: AspectRatio(
          aspectRatio: 210 / 297,
          child: DecoratedBox(
            decoration: BoxDecoration(color: colors.skeleton, borderRadius: BorderRadius.circular(DtRadius.sm)),
          ),
        ),
      ),
    );
  }
}

class _Failure extends StatelessWidget {
  const _Failure({required this.error, required this.onRetry});

  final ApiError error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final gone = error.code == 'CONTENT_UNAVAILABLE' || error.code == 'NOT_FOUND';
    final String message;
    if (gone) {
      message = l10n.lockNoLongerAvailable;
    } else if (error.code == ReferenceFiles.integrityCode) {
      message = l10n.viewerIntegrityFailed;
    } else {
      message = commonErrorText(context, error);
    }
    return Padding(
      padding: const EdgeInsets.all(DtSpace.s4),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          DtAlert(severity: DtAlertSeverity.neutral, body: message),
          if (!gone) ...[
            const SizedBox(height: DtSpace.s3),
            DtButton(label: l10n.commonRetry, variant: DtButtonVariant.secondary, onPressed: onRetry),
          ],
        ],
      ),
    );
  }
}
