import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_button.dart';
import '../../ui/dt_page.dart';
import '../../ui/dt_text_field.dart';
import '../../ui/error_text.dart';
import '../../ui/tokens.dart';
import 'profile_data.dart';
import 'profile_screen.dart';

/// « Modifier le profil »: name, photo and a short bio (≤ 280 characters). Needs a connection.
class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key});

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

/// The names and bio being edited, and progress flags.
class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _bio = TextEditingController();
  bool _loaded = false;
  bool _saving = false;
  bool _photoBusy = false;
  ApiError? _error;

  /// Frees the text controllers.
  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    _bio.dispose();
    super.dispose();
  }

  bool get _valid => _first.text.trim().isNotEmpty && _last.text.trim().isNotEmpty && _bio.text.length <= 280;

  /// « Enregistrer »: saves the names and bio.
  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref
          .read(meProvider.notifier)
          .save(firstName: _first.text.trim(), lastName: _last.text.trim(), bio: _bio.text.trim());
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(AppLocalizations.of(context).profileSaved)));
      context.pop();
    } catch (error) {
      if (mounted) setState(() => _error = ApiError.from(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// « Changer la photo »: picks a JPEG or PNG and uploads it.
  Future<void> _changePhoto() async {
    final picked = (await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['jpg', 'jpeg', 'png'],
    )).singleOrNull;
    if (picked?.path == null) return;
    final extension = (picked!.extension ?? '').toLowerCase();
    setState(() {
      _photoBusy = true;
      _error = null;
    });
    try {
      await ref
          .read(meProvider.notifier)
          .uploadPhoto(File(picked.path!), extension == 'png' ? 'image/png' : 'image/jpeg');
    } catch (error) {
      if (mounted) setState(() => _error = ApiError.from(error));
    } finally {
      if (mounted) setState(() => _photoBusy = false);
    }
  }

  /// « Supprimer la photo ».
  Future<void> _removePhoto() async {
    setState(() => _photoBusy = true);
    try {
      await ref.read(meProvider.notifier).removePhoto();
    } catch (error) {
      if (mounted) setState(() => _error = ApiError.from(error));
    } finally {
      if (mounted) setState(() => _photoBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final me = ref.watch(meProvider).value;
    if (me != null && !_loaded) {
      _first.text = me.firstName;
      _last.text = me.lastName;
      _bio.text = me.bio ?? '';
      _loaded = true;
    }
    return DtPage(
      title: l10n.profileEditTitle,
      actions: [
        if (_error != null) DtAlert(severity: DtAlertSeverity.critical, body: commonErrorText(context, _error!)),
        // « Enregistrer »: needs valid names.
        DtButton(label: l10n.profileSave, loading: _saving, onPressed: me != null && _valid ? _save : null),
      ],
      children: [
        if (me != null)
          Row(
            children: [
              ProfileAvatar(
                url: me.avatarUrl,
                initials: '${me.firstName.characters.firstOrNull ?? ''}${me.lastName.characters.firstOrNull ?? ''}',
              ),
              const SizedBox(width: DtSpace.s3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // « Changer la photo ».
                    DtButton(
                      label: l10n.profilePhotoChange,
                      variant: DtButtonVariant.secondary,
                      size: DtButtonSize.md,
                      expand: false,
                      loading: _photoBusy,
                      onPressed: _changePhoto,
                    ),
                    if (me.avatarUrl != null)
                      // « Supprimer la photo ».
                      TextButton(
                        onPressed: _photoBusy ? null : _removePhoto,
                        child: Text(l10n.profilePhotoRemove, style: DtType.label.copyWith(color: colors.brand)),
                      ),
                  ],
                ),
              ),
            ],
          ),
        const SizedBox(height: DtSpace.s1),
        Text(l10n.profilePhotoHelper, style: DtType.caption.copyWith(color: colors.inkMuted)),
        const SizedBox(height: DtSpace.s6),
        DtTextField(
          label: l10n.signUpFirstName,
          controller: _first,
          maxLength: 80,
          textCapitalization: TextCapitalization.words,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: DtSpace.s4),
        DtTextField(
          label: l10n.signUpLastName,
          controller: _last,
          maxLength: 80,
          textCapitalization: TextCapitalization.words,
          helper: l10n.profileNameNote,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: DtSpace.s4),
        DtTextField(
          label: l10n.profileBio,
          requiredMark: l10n.commonOptional,
          controller: _bio,
          maxLength: 280,
          helper: '${l10n.profileBioHelper} ${_bio.text.length}/280',
          onChanged: (_) => setState(() {}),
        ),
      ],
    );
  }
}
