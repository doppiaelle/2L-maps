import 'package:flutter_test/flutter_test.dart';
import '../lib/navigation_models.dart';
import '../lib/navigation_progress.dart';

void main() {
  const instructions = [
    NavigationInstruction(action: 'depart', distanceMeters: 100),
    NavigationInstruction(action: 'turn', distanceMeters: 200),
  ];

  test('advances instructions only when completed', () {
    final progress = NavigationProgress();
    expect(progress.current(instructions)!.action, 'depart');
    progress.update(distanceFromRouteMeters: 5, instructionCompleted: true, instructions: instructions);
    expect(progress.current(instructions)!.action, 'turn');
  });

  test('requests recalculation when off route', () {
    final progress = NavigationProgress(offRouteThresholdMeters: 25);
    progress.update(distanceFromRouteMeters: 26, instructionCompleted: false, instructions: instructions);
    expect(progress.recalculateRequested, isTrue);
    progress.update(distanceFromRouteMeters: 2, instructionCompleted: false, instructions: instructions);
    expect(progress.recalculateRequested, isFalse);
  });
}
