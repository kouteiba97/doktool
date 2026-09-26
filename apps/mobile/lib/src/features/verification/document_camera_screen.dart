import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../l10n/generated/app_localizations.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_button.dart';
import '../../ui/tokens.dart';

/// Full-screen capture with corner guides (FileUpload `camera-first`), then a review step
/// « Utiliser cette photo / Reprendre ». Returns the photo path, or null. The photo is shown only
/// here, before sending; afterwards the app shows the file name and size, never a thumbnail.
class DocumentCameraScreen extends StatefulWidget {
  const DocumentCameraScreen({required this.title, super.key});

  final String title;

  static Future<String?> capture(BuildContext context, String title) =>
      Navigator.of(context)
          .push<String>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => DocumentCameraScreen(title: title)));

  @override
  State<DocumentCameraScreen> createState() => _DocumentCameraScreenState();
}

class _DocumentCameraScreenState extends State<DocumentCameraScreen> {
  CameraController? _camera;
  bool _unavailable = false;
  bool _capturing = false;
  XFile? _photo;

  @override
  void initState() {
    super.initState();
    _open();
  }

  Future<void> _open() async {
    try {
      final cameras = await availableCameras();
      final back =
          cameras.where((camera) => camera.lensDirection == CameraLensDirection.back).firstOrNull ??
          cameras.firstOrNull;
      if (back == null) {
        setState(() => _unavailable = true);
        return;
      }
      final controller = CameraController(back, ResolutionPreset.high, enableAudio: false);
      await controller.initialize();
      await controller.setFlashMode(FlashMode.off);
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() => _camera = controller);
    } on CameraException {
      if (mounted) setState(() => _unavailable = true);
    }
  }

  @override
  void dispose() {
    _camera?.dispose();
    super.dispose();
  }

  Future<void> _shoot() async {
    final camera = _camera;
    if (camera == null || _capturing) return;
    setState(() => _capturing = true);
    try {
      final photo = await camera.takePicture();
      if (mounted) setState(() => _photo = photo);
    } on CameraException {
      if (mounted) setState(() => _unavailable = true);
    } finally {
      if (mounted) setState(() => _capturing = false);
    }
  }

  Future<void> _retake() async {
    final photo = _photo;
    setState(() => _photo = null);
    if (photo != null) await File(photo.path).delete().catchError((Object _) => File(photo.path));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final camera = _camera;
    final photo = _photo;
    return Scaffold(
      backgroundColor: colors.navy,
      appBar: AppBar(
        backgroundColor: colors.navy,
        foregroundColor: colors.onNavy,
        title: Text(widget.title, style: DtType.heading.copyWith(color: colors.onNavy)),
        leading: IconButton(
          tooltip: l10n.commonClose,
          icon: const Icon(LucideIcons.x),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: SafeArea(
        child: _unavailable
            ? Padding(
                padding: const EdgeInsets.all(DtSpace.s6),
                child: Center(
                  child: Text(
                    l10n.verificationDocumentCameraUnavailable,
                    textAlign: TextAlign.center,
                    style: DtType.body.copyWith(color: colors.onNavy),
                  ),
                ),
              )
            : Column(
                children: [
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.all(DtSpace.s4),
                      child: Center(
                        child: photo != null
                            ? ClipRRect(
                                borderRadius: BorderRadius.circular(DtRadius.md),
                                child: Image.file(File(photo.path), fit: BoxFit.contain),
                              )
                            : camera == null
                            ? CircularProgressIndicator(color: colors.onNavy)
                            : Stack(
                                alignment: Alignment.center,
                                children: [
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(DtRadius.md),
                                    child: CameraPreview(camera),
                                  ),
                                  const _Guides(),
                                ],
                              ),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(DtSpace.s4, 0, DtSpace.s4, DtSpace.s4),
                    child: photo != null
                        ? Column(
                            children: [
                              DtButton(
                                label: l10n.verificationDocumentUsePhoto,
                                onPressed: () => Navigator.of(context).pop(photo.path),
                              ),
                              const SizedBox(height: DtSpace.s2),
                              DtButton(
                                label: l10n.verificationDocumentRetake,
                                variant: DtButtonVariant.secondary,
                                onPressed: _retake,
                              ),
                            ],
                          )
                        : Column(
                            children: [
                              Text(
                                l10n.verificationDocumentGuide,
                                textAlign: TextAlign.center,
                                style: DtType.body.copyWith(color: colors.onNavy),
                              ),
                              const SizedBox(height: DtSpace.s4),
                              DtButton(
                                label: l10n.verificationDocumentCapture,
                                icon: LucideIcons.camera,
                                loading: _capturing,
                                onPressed: camera == null ? null : _shoot,
                              ),
                            ],
                          ),
                  ),
                ],
              ),
      ),
    );
  }
}

/// Corner guides of an ID-1 card (85.6 × 54 mm) centred in the preview.
class _Guides extends StatelessWidget {
  const _Guides();

  @override
  Widget build(BuildContext context) {
    final color = context.colors.onNavy;
    return FractionallySizedBox(
      widthFactor: 0.88,
      child: AspectRatio(
        aspectRatio: 85.6 / 54,
        child: CustomPaint(painter: _CornerPainter(color)),
      ),
    );
  }
}

class _CornerPainter extends CustomPainter {
  _CornerPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = DtBorder.focus * 2
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    final arm = size.shortestSide * 0.16;
    for (final (x, y, dx, dy) in [
      (0.0, 0.0, 1.0, 1.0),
      (size.width, 0.0, -1.0, 1.0),
      (0.0, size.height, 1.0, -1.0),
      (size.width, size.height, -1.0, -1.0),
    ]) {
      canvas
        ..drawLine(Offset(x, y), Offset(x + dx * arm, y), paint)
        ..drawLine(Offset(x, y), Offset(x, y + dy * arm), paint);
    }
  }

  @override
  bool shouldRepaint(_CornerPainter oldDelegate) => oldDelegate.color != color;
}
