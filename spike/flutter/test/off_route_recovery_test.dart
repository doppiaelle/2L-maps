import 'package:flutter_test/flutter_test.dart';
import 'package:twolmaps/off_route_recovery.dart';
import 'package:twolmaps/navigation_models.dart';
import 'package:twolmaps/speech_adapter.dart';

class _Engine implements SpeechEngine {
  final calls = <String>[];
  @override
  Future<void> speak(String text) async => calls.add(text);
}

class _Recalculator implements RouteRecalculator {
  int calls = 0;
  @override
  Future<HereRouteResult> recalculateToCurrentStop() async {
    calls++;
    return const HereRouteResult(polyline: 'new', distanceMeters: 10, durationSeconds: 5, instructions: []);
  }
}

void main() {
  test('announcer speaks early distance bands once and tolerates unavailable engine', () async {
    final engine = _Engine();
    final announcer = NavigationAnnouncer(engine);
    const instruction = NavigationInstruction(action: 'Svolta a destra', distanceMeters: 800);
    await announcer.announceWhenApproaching(instruction);
    await announcer.announceWhenApproaching(instruction);
    expect(engine.calls, hasLength(1));
    await NavigationAnnouncer(null).announce(instruction);
  });

  test('off-route requires persistent accurate samples and cooldown', () {
    var now = DateTime(2026, 1, 1);
    final monitor = OffRouteMonitor(
      requiredConsecutiveSamples: 3,
      cooldown: const Duration(seconds: 30),
      clock: () => now,
    );
    expect(monitor.evaluate(distanceFromRouteMeters: 100, accuracyMeters: 5, networkAvailable: true, endpointAvailable: true).shouldRecalculate, isFalse);
    expect(monitor.evaluate(distanceFromRouteMeters: 100, accuracyMeters: 5, networkAvailable: true, endpointAvailable: true).shouldRecalculate, isFalse);
    expect(monitor.evaluate(distanceFromRouteMeters: 100, accuracyMeters: 5, networkAvailable: true, endpointAvailable: true).shouldRecalculate, isTrue);
    expect(monitor.evaluate(distanceFromRouteMeters: 100, accuracyMeters: 5, networkAvailable: true, endpointAvailable: true).cause, RecoveryCause.cooldown);
    now = now.add(const Duration(seconds: 31));
    expect(monitor.evaluate(distanceFromRouteMeters: 100, accuracyMeters: 5, networkAvailable: true, endpointAvailable: true).shouldRecalculate, isTrue);
  });

  test('offline and inaccurate GPS do not trigger recalculation', () async {
    final recalc = _Recalculator();
    final recovery = NavigationRecovery(OffRouteMonitor(requiredConsecutiveSamples: 1), recalc);
    await recovery.onPosition(distanceFromRouteMeters: 100, accuracyMeters: 5, networkAvailable: false, endpointAvailable: true);
    await recovery.onPosition(distanceFromRouteMeters: 100, accuracyMeters: 100, networkAvailable: true, endpointAvailable: true);
    expect(recalc.calls, 0);
  });
}
