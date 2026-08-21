import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:twol_maps_spike/external_navigation.dart';

class _Launcher implements ExternalNavigationLauncher {
  final launched = <Uri>[];
  final available = <Uri>{};
  @override
  Future<bool> canLaunch(Uri uri) async => available.contains(uri);
  @override
  Future<bool> launch(Uri uri) async {
    launched.add(uri);
    return true;
  }
}

void main() {
  test('builds platform-specific links for the current stop only', () {
    const link = ExternalNavigationLink(latitude: 45.1, longitude: 7.2, label: 'Tappa');
    expect(link.appleMapsUri.queryParameters['daddr'], '45.1,7.2');
    expect(link.googleMapsUri.queryParameters['destination'], '45.1,7.2');
    expect(link.geoUri.path, '45.1,7.2');
    expect(link.webFallback.queryParameters['to'], '45.1,7.2');
  });

  test('uses installed navigator and falls back to web without whole itinerary', () async {
    const link = ExternalNavigationLink(latitude: 1, longitude: 2);
    final launcher = _Launcher()..available.add(link.geoUri);
    final controller = ExternalNavigationController(launcher);
    expect(
      await controller.openCurrentStop(
        currentStop: link,
        platform: TargetPlatform.android,
      ),
      isTrue,
    );
    expect(launcher.launched, [link.geoUri]);
  });

  test('missing stop does not launch anything', () async {
    final launcher = _Launcher();
    final controller = ExternalNavigationController(launcher);
    expect(
      await controller.openCurrentStop(
        currentStop: null,
        platform: TargetPlatform.iOS,
      ),
      isFalse,
    );
    expect(launcher.launched, isEmpty);
  });
}
