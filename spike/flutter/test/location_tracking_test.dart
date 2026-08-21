import 'dart:async';

import 'package:flutter_test/flutter_test.dart';

import '../lib/location_tracking.dart';
import '../lib/position_adapter.dart';

class FakeLocationPlatform implements DeviceLocationPlatform {
  FakeLocationPlatform({
    this.serviceEnabled = true,
    this.permission = DeviceLocationPermission.whileInUse,
  });

  bool serviceEnabled;
  DeviceLocationPermission permission;
  final StreamController<PositionFix> controller =
      StreamController<PositionFix>.broadcast();

  @override
  Future<DeviceLocationPermission> checkPermission() async => permission;

  @override
  Stream<PositionFix> get fixes => controller.stream;

  @override
  Future<bool> isServiceEnabled() async => serviceEnabled;

  @override
  Future<bool> openAppSettings() async => true;

  @override
  Future<bool> openLocationSettings() async => true;

  @override
  Future<DeviceLocationPermission> requestPermission() async => permission;

  Future<void> close() => controller.close();
}

PositionFix fix({
  double latitude = 45,
  double longitude = 9,
  double accuracy = 5,
  double? heading = 30,
  DateTime? timestamp,
}) =>
    PositionFix(
      latitude: latitude,
      longitude: longitude,
      accuracyMeters: accuracy,
      headingDegrees: heading,
      timestamp: timestamp ?? DateTime.now(),
    );

void main() {
  test('requests permission and forwards a valid native GPS fix', () async {
    final platform = FakeLocationPlatform(
      permission: DeviceLocationPermission.denied,
    );
    final tracker = LocationTrackingController(platform: platform);

    await tracker.start();
    platform.permission = DeviceLocationPermission.whileInUse;
    await tracker.start();
    platform.controller.add(fix());
    await Future<void>.delayed(Duration.zero);

    expect(tracker.state, LocationTrackingState.active);
    expect(tracker.latest?.headingDegrees, 30);
    expect(tracker.latest?.latitude, 45);

    tracker.dispose();
    await platform.close();
  });

  test('represents disabled GPS and weak positions explicitly', () async {
    final disabled = FakeLocationPlatform(serviceEnabled: false);
    final tracker = LocationTrackingController(platform: disabled);
    await tracker.start();
    expect(tracker.state, LocationTrackingState.serviceDisabled);
    tracker.dispose();
    await disabled.close();

    final platform = FakeLocationPlatform();
    final weakTracker = LocationTrackingController(platform: platform);
    await weakTracker.start();
    platform.controller.add(fix(accuracy: 160));
    await Future<void>.delayed(Duration.zero);
    expect(weakTracker.state, LocationTrackingState.weakSignal);
    expect(weakTracker.latest, isNull);
    weakTracker.dispose();
    await platform.close();
  });

  test('suspends updates and resumes the current position stream', () async {
    final platform = FakeLocationPlatform();
    final tracker = LocationTrackingController(platform: platform);
    await tracker.start();

    tracker.suspend();
    platform.controller.add(fix(latitude: 44));
    await Future<void>.delayed(Duration.zero);
    expect(tracker.state, LocationTrackingState.suspended);
    expect(tracker.latest, isNull);

    tracker.resume();
    await Future<void>.delayed(Duration.zero);
    expect(tracker.latest?.latitude, 44);

    tracker.dispose();
    await platform.close();
  });

  test('quality filter rejects impossible coordinates and future fixes', () {
    const filter = PositionFixFilter();
    expect(filter.rejectionReason(fix(latitude: 91)), isNotNull);
    expect(
      filter.rejectionReason(
        fix(timestamp: DateTime.now().add(const Duration(minutes: 1))),
      ),
      isNotNull,
    );
  });
}
