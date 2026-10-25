import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';

/// Result of the on-device check of a photographed document (FileUpload « processing » state).
@immutable
class DocumentCheck {
  const DocumentCheck({required this.legible, required this.nameFound});

  /// Enough text was read to consider the photo usable.
  final bool legible;

  /// The account's last name (and first name when present) appear in the text read.
  final bool nameFound;
}

/// Reads a document photo on the device with ML Kit (ADR-013: nothing it reads leaves the device)
/// to catch blurred, cut or glaring photos and a name that differs from the account before upload.
/// The reviewer remains the judge; this only saves a rejection.
abstract class DocumentChecker {
  Future<DocumentCheck> check(String imagePath, {required String firstName, required String lastName});
}

/// Checks on the phone (ML Kit text recognition) that a document is readable and bears the person's name.
class MlKitDocumentChecker implements DocumentChecker {
  /// Below this many letters and digits, the photo is treated as unreadable.
  static const _minCharacters = 25;
  static const _minLines = 3;

  /// Reads the photo text: too little text is unreadable; the name must appear in it.
  @override
  Future<DocumentCheck> check(String imagePath, {required String firstName, required String lastName}) async {
    final recognizer = TextRecognizer(script: TextRecognitionScript.latin);
    try {
      final text = await recognizer.processImage(InputImage.fromFilePath(imagePath));
      final lines = text.blocks.expand((block) => block.lines).length;
      final characters = RegExp('[A-Za-z0-9]').allMatches(text.text).length;
      final legible = characters >= _minCharacters && lines >= _minLines;
      return DocumentCheck(legible: legible, nameFound: legible && namePresent(text.text, firstName, lastName));
    } finally {
      await recognizer.close();
    }
  }
}

/// Upper case without accents, every separator (including the MRZ filler `<`) as one space.
String foldForMatch(String value) {
  const accents = {
    'À': 'A', 'Â': 'A', 'Ä': 'A', 'Á': 'A', 'Ç': 'C', 'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E', //
    'Î': 'I', 'Ï': 'I', 'Í': 'I', 'Ô': 'O', 'Ö': 'O', 'Ó': 'O', 'Ù': 'U', 'Û': 'U', 'Ü': 'U', 'Ú': 'U',
  };
  final upper = value.toUpperCase();
  final buffer = StringBuffer();
  for (final char in upper.split('')) {
    buffer.write(accents[char] ?? char);
  }
  return ' ${buffer.toString().replaceAll(RegExp('[^A-Z0-9]+'), ' ').trim()} ';
}

/// Every word of the last name must appear; the first name's first word too when it has one.
@visibleForTesting
bool namePresent(String text, String firstName, String lastName) {
  final haystack = foldForMatch(text);
  final lastWords = foldForMatch(lastName).trim().split(' ').where((word) => word.length > 1);
  final firstWords = foldForMatch(firstName).trim().split(' ').where((word) => word.length > 1);
  if (lastWords.isEmpty) return false;
  // A passport MRZ glues the issuing country to the surname: « P<DZABENALI<<SAMIR ».
  bool present(String word) =>
      haystack.contains(' $word ') || RegExp(' P [A-Z]{3}${RegExp.escape(word)} ').hasMatch(haystack);
  final lastOk = lastWords.every(present);
  final firstOk = firstWords.isEmpty || haystack.contains(' ${firstWords.first} ');
  return lastOk && firstOk;
}

final documentCheckerProvider = Provider<DocumentChecker>((ref) => MlKitDocumentChecker());
