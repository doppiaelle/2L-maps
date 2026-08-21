import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart' as geo;

import 'position_adapter.dart';

enum LocationTrackingState {
  idle,
  requestingPermission,
  active,
  weakSignal,
  serviceDisabled,
  permissionDenied,
  permissionDeniedForever,
  suspended,
  error,
}

enum DeviceLocationPermission {
  denied,
  deniedForever,
  whileInUse,
  always,
}

abstract interface class DeviceLocationPlatform {
  Future<bool> isServiceEnabled();
  Future<DeviceLocationPermission> checkPermission();
  Future<DeviceLocationPermission> requestPermission();
  Stream<PositionFix> get fixes;
  Future<bool> openAppSettings();
  Future<bool> openLocationSettings();
}

class GeolocatorDeviceLocationPlatform implements DeviceLocationPlatform {
  const GeolocatorDeviceLocationPlatform({
    this.distanceFilterMeters = 5,
    this.accuracy = geo.LocationAccuracy.bestForNavigation,
  });

  final int distanceFilterMeters;
  final geo.LocationAccuracy accuracy;

  @override
  Future<bool> isServiceEnabled() => geo.Geolocator.isLocationServiceEnabled();

  @override
  Future<DeviceLocationPermission> checkPermission() async =>
      _permission(await geo.Geolocator.checkPermission());

  @override
  Future<DeviceLocationPermission> requestPermission() async =>
      _permission(await geo.Geolocator.requestPermission());

  @override
  Stream<PositionFix> get fixes => geo.Geolocator.getPositionStream(
        locationSettings: geo.LocationSettings(
          accuracy: accuracy,
          distanceFilter: distanceFilterMeters,
        ),
      ).map(
        (position) => PositionFix(
          latitude: position.latitude,
          longitude: position.longitude,
          accuracyMeters: position.accuracy,
          headingDegrees: position.heading >= 0 ? position.heading : null,
          speedMetersPerSecond: position.speed >= 0 ? position.speed : null,
          timestamp: position.timestamp,
        ),
      );

  @override
  Future<bool> openAppSettings() => geo.Geolocator.openAppSettings();

  @override
  Future<bool> openLocationSettings() => geo.Geolocator.openLocationSettings();

  DeviceLocationPermission _permission(geo.LocationPermission permission) =>
      switch (permission) {
        geo.LocationPermission.always => DeviceLocationPermission.always,
        geo.LocationPermission.whileInUse => DeviceLocationPermission.whileInUse,
        geo.LocationPermission.deniedForever =>
          DeviceLocationPermission.deniedForever,
        geo.LocationPermission.denied => DeviceLocationPermission.denied,
        geo.LocationPermission.unableToDetermine =>
          DeviceLocationPermission.denied,
      };
}

class PositionFixFilter {
  const PositionFixFilter({
    this.maxAccuracyMeters = 80,
    this.maxFutureSkew = const Duration(seconds: 5),
  });

  final double maxAccuracyMeters;
  final Duration maxFutureSkew;

  String? rejectionReason(PositionFix fix, {DateTime? now}) {
    if (fix.latitude < -90 || fix.latitude > 90 ||
        fix.longitude < -180 || fix.longitude > 180) {
      return 'Coordinate GPS non valide';
    }
    if (!fix.accuracyMeters.isFinite ||
        fix.accuracyMeters <= 0 ||
        fix.accuracyMeters > maxAccuracyMeters) {
      return 'Segnale GPS debole';
    }
    if (fix.headingDegrees != null &&
        (fix.headingDegrees! < 0 || fix.headingDegrees! >= 360)) {
      return 'Direzione GPS non valida';
    }
    if (fix.timestamp.isAfter((now ?? DateTime.now()).add(maxFutureSkew))) {
      return 'Orario GPS non valido';
    }
    return null;
  }
}

class LocationTrackingController extends ChangeNotifier {
  LocationTrackingController({
    required this.platform,
    this.filter = const PositionFixFilter(),
  });

  final DeviceLocationPlatform platform;
  final PositionFixFilter filter;
  StreamSubscription<PositionFix>? _subscription;
  PositionFix? _latest;
  LocationTrackingState _state = LocationTrackingState.idle;
  String? _message;
  bool _suspended = false;

  PositionFix? get latest => _latest;
  LocationTrackingState get state => _state;
  String? get message => _message;
  bool get hasPosition => _latest != null;

  Future<void> start() async {
    _set(LocationTrackingState.requestingPermission);
    if (!await platform.isServiceEnabled()) {
      _set(LocationTrackingState.serviceDisabled, 'Attiva il GPS per continuare.');
      return;
    }

    var permission = await platform.checkPermission();
    if (permission == DeviceLocationPermission.denied) {
      permission = await platform.requestPermission();
    }
    if (permission == DeviceLocationPermission.deniedForever) {
      _set(LocationTrackingState.permissionDeniedForever,
          'Consenti la posizione nelle impostazioni dell’app.');
      return;
    }
    if (permission == DeviceLocationPermission.denied) {
      _set(LocationTrackingState.permissionDenied,
          'Il permesso di posizione è necessario per la navigazione.');
      return;
    }

    await _subscription?.cancel();
    _subscription = platform.fixes.listen(
      _onFix,
      onError: (_, __) => _set(
        LocationTrackingState.error,
        'Impossibile leggere la posizione del dispositivo.',
      ),
    );
    _set(LocationTrackingState.active, 'Ricerca posizione iniziale…');
  }

  void _onFix(PositionFix fix) {
    if (_suspended) return;
    final rejection = filter.rejectionReason(fix);
    if (rejection != null) {
      _set(LocationTrackingState.weakSignal, rejection);
      return;
    }
    if (_latest != null && fix.timestamp.isBefore(_latest!.timestamp)) return;
    _latest = fix;
    _set(LocationTrackingState.active);
  }

  void suspend() {
    if (_suspended || _subscription == null) return;
    _suspended = true;
    _subscription!.pause();
    _set(LocationTrackingState.suspended,
        'Posizione sospesa finché l’app non torna in primo piano.');
  }

  void resume() {
    if (!_suspended || _subscription == null) return;
    _suspended = false;
    _subscription!.resume();
    _set(LocationTrackingState.active,
        _latest == null ? 'Ricerca posizione iniziale…' : null);
  }

  Future<void> openSettingsForCurrentIssue() =>
      state == LocationTrackingState.serviceDisabled
          ? platform.openLocationSettings()
          : platform.openAppSettings();

  void _set(LocationTrackingState state, [String? message]) {
    _state = state;
    _message = message;
    notifyListeners();
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }
}
