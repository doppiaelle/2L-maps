import 'navigation_models.dart';

enum RecoveryCause { offRoute, gpsImprecise, offline, endpointUnavailable, cooldown }

class RecalculationDecision {
  const RecalculationDecision({
    required this.shouldRecalculate,
    required this.cause,
  });
  final bool shouldRecalculate;
  final RecoveryCause cause;
}

class OffRouteMonitor {
  OffRouteMonitor({
    this.thresholdMeters = 50,
    this.requiredConsecutiveSamples = 3,
    this.cooldown = const Duration(seconds: 30),
    DateTime Function()? clock,
  }) : _clock = clock ?? DateTime.now;

  final double thresholdMeters;
  final int requiredConsecutiveSamples;
  final Duration cooldown;
  final DateTime Function() _clock;
  int _consecutive = 0;
  DateTime? _lastRecalculation;

  RecalculationDecision evaluate({
    required double distanceFromRouteMeters,
    required double accuracyMeters,
    required bool networkAvailable,
    required bool endpointAvailable,
  }) {
    if (!networkAvailable) {
      _consecutive = 0;
      return const RecalculationDecision(shouldRecalculate: false, cause: RecoveryCause.offline);
    }
    if (!endpointAvailable) {
      return const RecalculationDecision(
        shouldRecalculate: false,
        cause: RecoveryCause.endpointUnavailable,
      );
    }
    if (accuracyMeters > thresholdMeters || distanceFromRouteMeters <= thresholdMeters) {
      _consecutive = 0;
      return const RecalculationDecision(
        shouldRecalculate: false,
        cause: RecoveryCause.gpsImprecise,
      );
    }
    _consecutive++;
    if (_consecutive < requiredConsecutiveSamples) {
      return const RecalculationDecision(
        shouldRecalculate: false,
        cause: RecoveryCause.gpsImprecise,
      );
    }
    final now = _clock();
    if (_lastRecalculation != null && now.difference(_lastRecalculation!) < cooldown) {
      return const RecalculationDecision(shouldRecalculate: false, cause: RecoveryCause.cooldown);
    }
    _lastRecalculation = now;
    _consecutive = 0;
    return const RecalculationDecision(shouldRecalculate: true, cause: RecoveryCause.offRoute);
  }

  void reset() {
    _consecutive = 0;
    _lastRecalculation = null;
  }
}

abstract interface class RouteRecalculator {
  Future<HereRouteResult> recalculateToCurrentStop();
}

class NavigationRecovery {
  NavigationRecovery(this.monitor, this.recalculator);

  final OffRouteMonitor monitor;
  final RouteRecalculator recalculator;

  Future<HereRouteResult?> onPosition({
    required double distanceFromRouteMeters,
    required double accuracyMeters,
    required bool networkAvailable,
    required bool endpointAvailable,
  }) async {
    final decision = monitor.evaluate(
      distanceFromRouteMeters: distanceFromRouteMeters,
      accuracyMeters: accuracyMeters,
      networkAvailable: networkAvailable,
      endpointAvailable: endpointAvailable,
    );
    if (!decision.shouldRecalculate) return null;
    return recalculator.recalculateToCurrentStop();
  }
}
