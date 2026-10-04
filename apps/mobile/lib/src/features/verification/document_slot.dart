import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_error.dart';
import '../../core/api/generated/models/verification_document_dto.dart';
import '../../core/api/generated/models/verification_step_type.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_button.dart';
import '../../ui/error_text.dart';
import '../../ui/tokens.dart';
import '../account/account_controller.dart';
import 'document_camera_screen.dart';
import 'document_check.dart';
import 'verification_controller.dart';
import 'verification_repository.dart';

const _contentTypes = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'pdf': 'application/pdf'};

enum _Phase { idle, checking, uploading, quality, done, failed }

enum _Quality { illegible, nameMismatch }

class _Picked {
  const _Picked({required this.path, required this.contentType, required this.fromCamera});

  final String path;
  final String contentType;
  final bool fromCamera;
}

/// One document step of a verification case (component FileUpload, variant `document`): camera
/// first, file import second, on-device legibility and name check for photos, then upload to
/// private storage. After upload it shows what was read and the size — never a thumbnail.
class DocumentSlot extends ConsumerStatefulWidget {
  const DocumentSlot({
    required this.caseId,
    required this.stepType,
    required this.label,
    required this.document,
    this.requiredMark,
    this.enabled = true,
    super.key,
  });

  final String caseId;
  final VerificationStepType stepType;
  final String label;
  final String? requiredMark;

  /// The file already attached to this step, if any.
  final VerificationDocumentDto? document;
  final bool enabled;

  @override
  ConsumerState<DocumentSlot> createState() => _DocumentSlotState();
}

class _DocumentSlotState extends ConsumerState<DocumentSlot> {
  _Phase _phase = _Phase.idle;
  _Quality? _quality;
  _Picked? _pending;
  double _progress = 0;
  String? _error;

  /// What the on-device check read for the file uploaded in this session (the server never gets it).
  String? _nameRead;
  bool _checkedLegible = false;

  Future<void> _fromCamera() async {
    final path = await DocumentCameraScreen.capture(context, widget.label);
    if (path != null) await _accept(_Picked(path: path, contentType: 'image/jpeg', fromCamera: true));
  }

  Future<void> _fromFiles() async {
    final l10n = AppLocalizations.of(context);
    final picked = await FilePicker.pickFiles(type: FileType.custom, allowedExtensions: _contentTypes.keys.toList());
    final file = picked.singleOrNull;
    if (file?.path == null) return;
    final contentType = _contentTypes[(file!.extension ?? '').toLowerCase()];
    if (contentType == null) {
      setState(() {
        _phase = _Phase.failed;
        _error = l10n.verificationDocumentWrongType;
      });
      return;
    }
    await _accept(_Picked(path: file.path!, contentType: contentType, fromCamera: false));
  }

  Future<void> _accept(_Picked picked) async {
    final l10n = AppLocalizations.of(context);
    final size = await File(picked.path).length();
    if (size > maxVerificationFileBytes) {
      await _discard(picked);
      setState(() {
        _phase = _Phase.failed;
        _error = l10n.verificationDocumentTooLarge;
      });
      return;
    }
    _nameRead = null;
    _checkedLegible = false;
    if (picked.contentType == 'application/pdf') return _upload(picked);

    setState(() {
      _phase = _Phase.checking;
      _error = null;
    });
    final account = ref.read(accountControllerProvider).value;
    DocumentCheck? check;
    try {
      check = await ref
          .read(documentCheckerProvider)
          .check(picked.path, firstName: account?.firstName ?? '', lastName: account?.lastName ?? '');
    } catch (_) {
      // The check is a help, not a gate: if ML Kit is unavailable the reviewer still decides.
    }
    if (!mounted) return;
    if (check != null && !check.legible) {
      setState(() {
        _phase = _Phase.quality;
        _quality = _Quality.illegible;
        _pending = picked;
      });
      return;
    }
    if (check != null && !check.nameFound && _isIdentityStep) {
      setState(() {
        _phase = _Phase.quality;
        _quality = _Quality.nameMismatch;
        _pending = picked;
      });
      return;
    }
    _checkedLegible = check?.legible ?? false;
    if (check != null && check.nameFound && account != null) {
      _nameRead = '${account.lastName.toUpperCase()} ${account.firstName}';
    }
    await _upload(picked);
  }

  bool get _isIdentityStep =>
      widget.stepType == VerificationStepType.identityFront || widget.stepType == VerificationStepType.identityBack;

  Future<void> _upload(_Picked picked) async {
    final l10n = AppLocalizations.of(context);
    setState(() {
      _phase = _Phase.uploading;
      _progress = 0;
      _error = null;
      _pending = null;
    });
    try {
      final bytes = await File(picked.path).readAsBytes();
      final updated = await ref
          .read(verificationRepositoryProvider)
          .upload(
            caseId: widget.caseId,
            stepType: widget.stepType,
            bytes: bytes,
            contentType: picked.contentType,
            onProgress: (progress) {
              if (mounted) setState(() => _progress = progress);
            },
          );
      ref.read(verificationControllerProvider.notifier).replace(updated);
      await _discard(picked);
      if (mounted) setState(() => _phase = _Phase.done);
    } catch (error) {
      final apiError = ApiError.from(error);
      if (mounted) {
        setState(() {
          _phase = _Phase.failed;
          _pending = picked;
          _error = apiError.isNetwork ? l10n.errorsNetwork : l10n.verificationDocumentUploadFailed;
        });
      }
    }
  }

  /// Camera photos are temporary files of this app; they are deleted once sent or refused.
  Future<void> _discard(_Picked picked) async {
    if (!picked.fromCamera) return;
    try {
      await File(picked.path).delete();
    } on FileSystemException {
      // Already gone.
    }
  }

  Future<void> _remove(VerificationDocumentDto document) async {
    try {
      final updated = await ref.read(verificationRepositoryProvider).removeDocument(widget.caseId, document.id);
      ref.read(verificationControllerProvider.notifier).replace(updated);
      if (mounted) setState(() => _phase = _Phase.idle);
    } catch (error) {
      if (mounted) setState(() => _error = commonErrorText(context, ApiError.from(error)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final document = widget.document;
    final busy = _phase == _Phase.checking || _phase == _Phase.uploading;

    Widget body;
    if (busy) {
      body = _Row(
        icon: LucideIcons.fileUp,
        title: _phase == _Phase.checking ? l10n.verificationDocumentChecking : l10n.verificationDocumentUploading,
        child: Semantics(
          value: '${(_progress * 100).round()} %',
          child: LinearProgressIndicator(
            value: _phase == _Phase.uploading ? _progress : null,
            color: colors.brand,
            backgroundColor: colors.surfaceSunken,
          ),
        ),
      );
    } else if (_phase == _Phase.quality && _pending != null) {
      body = DtAlert(
        severity: DtAlertSeverity.warning,
        body: _quality == _Quality.illegible
            ? l10n.verificationDocumentIllegible
            : l10n.verificationDocumentNameMismatch(
                '${ref.read(accountControllerProvider).value?.lastName.toUpperCase() ?? ''} '
                '${ref.read(accountControllerProvider).value?.firstName ?? ''}',
              ),
        action: Wrap(
          spacing: DtSpace.s2,
          runSpacing: DtSpace.s2,
          children: [
            DtButton(
              label: l10n.verificationDocumentRetake,
              size: DtButtonSize.md,
              expand: false,
              onPressed: () async {
                final pending = _pending!;
                await _discard(pending);
                setState(() => _phase = _Phase.idle);
                await _fromCamera();
              },
            ),
            DtButton(
              label: l10n.verificationDocumentSendAnyway,
              variant: DtButtonVariant.secondary,
              size: DtButtonSize.md,
              expand: false,
              onPressed: () => _upload(_pending!),
            ),
          ],
        ),
      );
    } else if (document != null) {
      final isPdf = document.contentType == 'application/pdf';
      final size = sizeText(context, document.sizeBytes);
      final line = _nameRead != null
          ? l10n.verificationDocumentLegibleName(_nameRead!)
          : isPdf
          ? l10n.verificationDocumentPdfNotChecked(size)
          : _checkedLegible
          ? l10n.verificationDocumentLegible(size)
          : '${_typeLabel(document.contentType)} · $size';
      body = _Row(
        icon: LucideIcons.fileCheck,
        iconColor: colors.success,
        title: '${widget.label} · ${_typeLabel(document.contentType)}',
        subtitle: line,
        actions: widget.enabled
            ? [
                DtButton(
                  label: l10n.verificationDocumentReplace,
                  variant: DtButtonVariant.ghost,
                  size: DtButtonSize.sm,
                  expand: false,
                  onPressed: _fromCamera,
                ),
                if (widget.requiredMark == null)
                  DtButton(
                    label: l10n.verificationDocumentRemove,
                    variant: DtButtonVariant.ghost,
                    size: DtButtonSize.sm,
                    expand: false,
                    onPressed: () => _remove(document),
                  ),
              ]
            : const [],
      );
    } else {
      body = Container(
        constraints: const BoxConstraints(minHeight: 140),
        padding: const EdgeInsets.all(DtSpace.s4),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(DtRadius.xl),
          border: Border.all(color: colors.borderStrong, width: DtBorder.control),
          boxShadow: context.elevation.glass,
        ),
        child: Column(
          children: [
            Icon(LucideIcons.scanLine, color: colors.inkMuted, size: DtSpace.s8),
            const SizedBox(height: DtSpace.s2),
            Text(
              l10n.verificationDocumentGuide,
              textAlign: TextAlign.center,
              style: DtType.body.copyWith(color: colors.inkSecondary),
            ),
            const SizedBox(height: DtSpace.s3),
            DtButton(
              label: l10n.verificationDocumentCapture,
              icon: LucideIcons.camera,
              size: DtButtonSize.md,
              onPressed: widget.enabled ? _fromCamera : null,
            ),
            const SizedBox(height: DtSpace.s2),
            DtButton(
              label: l10n.verificationDocumentImport,
              icon: LucideIcons.upload,
              variant: DtButtonVariant.secondary,
              size: DtButtonSize.md,
              onPressed: widget.enabled ? _fromFiles : null,
            ),
            const SizedBox(height: DtSpace.s2),
            Text(l10n.verificationDocumentFormats, style: DtType.caption.copyWith(color: colors.inkMuted)),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text.rich(
          TextSpan(
            text: widget.label,
            children: [
              if (widget.requiredMark != null)
                TextSpan(
                  text: ' · ${widget.requiredMark}',
                  style: DtType.caption.copyWith(color: colors.inkMuted),
                ),
            ],
          ),
          style: DtType.label.copyWith(color: colors.inkSecondary),
        ),
        const SizedBox(height: DtSpace.s1),
        body,
        if (_phase == _Phase.failed && _error != null) ...[
          const SizedBox(height: DtSpace.s2),
          DtAlert(
            severity: DtAlertSeverity.critical,
            body: _error!,
            action: _pending == null
                ? null
                : DtButton(
                    label: l10n.commonRetry,
                    size: DtButtonSize.md,
                    expand: false,
                    onPressed: () => _upload(_pending!),
                  ),
          ),
        ],
      ],
    );
  }

  String _typeLabel(String contentType) => switch (contentType) {
    'application/pdf' => 'PDF',
    'image/png' => 'PNG',
    _ => 'JPG',
  };
}

class _Row extends StatelessWidget {
  const _Row({
    required this.icon,
    required this.title,
    this.subtitle,
    this.child,
    this.iconColor,
    this.actions = const [],
  });

  final IconData icon;
  final Color? iconColor;
  final String title;
  final String? subtitle;
  final Widget? child;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Container(
      constraints: const BoxConstraints(minHeight: 56),
      padding: const EdgeInsets.all(DtSpace.s3),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(DtRadius.xl),
        border: Border.all(color: colors.glassHighlight, width: DtBorder.hairline),
        boxShadow: context.elevation.glass,
      ),
      child: Row(
        children: [
          Icon(icon, color: iconColor ?? colors.inkSecondary, size: DtSpace.s6),
          const SizedBox(width: DtSpace.s3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  overflow: TextOverflow.ellipsis,
                  style: DtType.bodyStrong.copyWith(color: colors.ink),
                ),
                if (subtitle != null) Text(subtitle!, style: DtType.caption.copyWith(color: colors.inkSecondary)),
                if (child != null) ...[const SizedBox(height: DtSpace.s2), child!],
              ],
            ),
          ),
          ...actions,
        ],
      ),
    );
  }
}
