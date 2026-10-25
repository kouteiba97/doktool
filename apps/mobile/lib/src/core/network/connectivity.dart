import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// How the phone is connected right now.
enum NetworkKind { offline, wifi, mobile }

/// Wi-Fi or Ethernet count as Wi-Fi; mobile or VPN as mobile data; anything else is offline.
NetworkKind _kindOf(List<ConnectivityResult> results) {
  if (results.contains(ConnectivityResult.wifi) || results.contains(ConnectivityResult.ethernet)) {
    return NetworkKind.wifi;
  }
  if (results.contains(ConnectivityResult.mobile) || results.contains(ConnectivityResult.vpn)) {
    return NetworkKind.mobile;
  }
  return results.isEmpty || results.every((result) => result == ConnectivityResult.none)
      ? NetworkKind.offline
      : NetworkKind.mobile;
}

/// The device's link: offline is a product mode, not an error (Locks L16, L44).
final networkProvider = StreamProvider<NetworkKind>((ref) async* {
  final connectivity = Connectivity();
  yield _kindOf(await connectivity.checkConnectivity());
  yield* connectivity.onConnectivityChanged.map(_kindOf);
});

/// True unless the device is known to be offline (unknown counts as online).
final isOnlineProvider = Provider<bool>((ref) => ref.watch(networkProvider).value != NetworkKind.offline);
