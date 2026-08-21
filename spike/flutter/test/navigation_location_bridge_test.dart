import 'dart:async';

import 'package:flutter_test/flutter_test.dart';

import '../lib/location_tracking.dart';
import '../lib/map_presenter.dart';
import '../lib/map_rendering.dart';
import '../lib/navigation_location_bridge.dart';
import '../lib/navigation_models.dart';
import '../lib/navigation_progress.dart';
import '../lib/navigation_session.dart';
import '../lib/position_adapter.dart';
import '../lib/speech_adapter.dart';

class _FakePlatform implements DeviceLocationPlatform {
  final controller = StreamController<PositionFix>.broadcast();

  @override
  Future<DeviceLocationPermission> checkPermission() async =>
      DeviceLocationPermission.whileInUse;

  @override
  Stream<PositionFix> get fixes => controller.stream;

  @override
  Future<bool> isServiceEnabled() async => true;

  @override
  Future<bool> openAppSettings() async => true;

  @override
  Future<bool> openLocationSettings() async => true;

  @override
  Future<DeviceLocationPermission> requestPermission() async =>
      DeviceLocationPermission.whileInUse;
}

class _Map implements MapRenderer {
  int follows = 0;

  @override
  Future<void> setCamera({
    required latitude,
    required longitude,
    required zoom,
    required double pitch,
  }) async {
    follows++;
  }

  @override
  Future<void> setTheme(MapTheme theme) async {}

  @override
  Future<void> showRoute(RouteOverlay overlay) async {}
}

class _Speech implements SpeechEngine {
  final calls = <String>[];

  @override
  Future<void> speak(String text) async => calls.add(text);
}

void main() {
  test('forwards accepted device positions into the navigation kernel', () async {
    final platform = _FakePlatform();
    final tracking = LocationTrackingController(platform: platform);
    final map = _Map();
    final speech = _Speech();
    final progress = NavigationProgress();
    final session = NavigationSession(
      progress: progress,
      positionAdapter: NavigationPositionAdapter(progress),
      mapPresenter: MapPresenter(map),
      announcer: NavigationAnnouncer(speech),
    );
    await session.start(const RouteOverlay(polyline: 'route', markers: []));
    final bridge = NavigationLocationBridge(
      tracking: tracking,
      session: session,
      distanceFromRoute: (_) => 1,
      instructionCompleted: (_) => false,
      instructions: () => const [
        NavigationInstruction(action: 'Parti', distanceMeters: 20),
      ],
    );

    bridge.start();
    await tracking.start();
    platform.controller.add(
      PositionFix(
        latitude: 45,
        longitude: 9,
        accuracyMeters: 4,
        timestamp: DateTime.now(),
      ),
    );
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);

    expect(map.follows, 1);
    expect(speech.calls, ['Parti']);

    bridge.stop();
    tracking.dispose();
    await platform.controller.close();
  });
}
