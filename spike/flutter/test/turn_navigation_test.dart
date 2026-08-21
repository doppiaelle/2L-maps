import 'package:flutter_test/flutter_test.dart';

import '../lib/navigation_models.dart';
import '../lib/turn_navigation.dart';

void main() {
  final start = DateTime(2026, 1, 1, 10);
  HereRouteResult route() => const HereRouteResult(
        polyline: 'full',
        sectionPolylines: ['one', 'two'],
        distanceMeters: 1200,
        durationSeconds: 600,
        instructions: [
          NavigationInstruction(action: 'depart', distanceMeters: 100),
          NavigationInstruction(action: 'turn-left', distanceMeters: 300),
        ],
      );

  test('starts with current and next maneuver plus ETA', () {
    final controller = TurnNavigationController(clock: () => start);
    controller.start(route());

    expect(controller.status, TurnNavigationStatus.running);
    expect(controller.currentInstruction?.action, 'depart');
    expect(controller.nextInstruction?.action, 'turn-left');
    expect(controller.distanceRemainingMeters, 1200);
    expect(controller.activePolyline, 'one');
    expect(controller.eta, start.add(const Duration(minutes: 10)));
  });

  test('advances maneuvers and sections, then completes at stop', () {
    final controller = TurnNavigationController(clock: () => start);
    controller.start(route());
    controller.update(
      distanceToInstructionMeters: 0,
      instructionCompleted: true,
      distanceRemainingMeters: 700,
      durationRemainingSeconds: 300,
      sectionIndex: 1,
    );
    expect(controller.currentInstruction?.action, 'turn-left');
    expect(controller.activePolyline, 'two');

    controller.update(
      distanceToInstructionMeters: 0,
      instructionCompleted: true,
      distanceRemainingMeters: 0,
      durationRemainingSeconds: 0,
      arrivedAtStop: true,
    );
    expect(controller.status, TurnNavigationStatus.completed);
    expect(controller.arrivedAtStop, isTrue);
  });

  test('pause, resume, stop and snapshot are deterministic', () {
    final controller = TurnNavigationController(clock: () => start);
    controller.start(route());
    controller.pause();
    expect(controller.status, TurnNavigationStatus.paused);
    controller.resume();
    expect(controller.status, TurnNavigationStatus.running);
    controller.stop();
    expect(controller.status, TurnNavigationStatus.stopped);
    expect(controller.snapshot?.toJson()['status'], 'stopped');
  });
}
