/// Lower case without accents, for accent- and case-insensitive matching (section 12).
String foldText(String value) {
  const accents = {
    'à': 'a', 'â': 'a', 'ä': 'a', 'á': 'a', 'ç': 'c', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e', //
    'î': 'i', 'ï': 'i', 'í': 'i', 'ô': 'o', 'ö': 'o', 'ó': 'o', 'ù': 'u', 'û': 'u', 'ü': 'u', 'ú': 'u',
  };
  final buffer = StringBuffer();
  for (final char in value.toLowerCase().split('')) {
    buffer.write(accents[char] ?? char);
  }
  return buffer.toString();
}

/// True when every word of [query] appears in one of [texts], in any order (same rule as the API).
bool matchesAllWords(String query, Iterable<String?> texts) {
  final words = foldText(query).split(RegExp(r"[\s'’-]+")).where((word) => word.isNotEmpty).toList();
  if (words.isEmpty) return true;
  return texts.any((text) {
    final haystack = foldText(text ?? '');
    return words.every(haystack.contains);
  });
}
