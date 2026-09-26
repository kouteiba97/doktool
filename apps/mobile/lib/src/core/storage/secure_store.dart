import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';

/// Keychain / Keystore storage for secrets (audit Appendix D): the installation id and the session
/// tokens. Never the database, never shared preferences.
class SecureStore {
  SecureStore(this._storage);

  final FlutterSecureStorage _storage;

  static const _installationIdKey = 'installation_id';

  /// A random id created on first launch. Device sessions and demo sessions are bound to it; it
  /// carries nothing about the person or the hardware.
  Future<String> installationId() async {
    final existing = await _storage.read(key: _installationIdKey);
    if (existing != null && existing.isNotEmpty) return existing;
    final created = const Uuid().v4();
    await _storage.write(key: _installationIdKey, value: created);
    return created;
  }

  Future<String?> read(String key) => _storage.read(key: key);

  Future<void> write(String key, String value) => _storage.write(key: key, value: value);

  Future<void> delete(String key) => _storage.delete(key: key);
}

final secureStoreProvider = Provider<SecureStore>((ref) => SecureStore(const FlutterSecureStorage()));
