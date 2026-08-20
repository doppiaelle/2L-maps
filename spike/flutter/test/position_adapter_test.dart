import 'package:flutter_test/flutter_test.dart';
import '../lib/navigation_models.dart';
import '../lib/navigation_progress.dart';
import '../lib/position_adapter.dart';

void main() {
  test('position fix feeds progress kernel without provider coupling', () {
    final progress = NavigationProgress();
    final adapter = NavigationPositionAdapter(progress);
    const instructions = [NavigationInstruction(action: 'depart', distanceMeters: 10)];
    adapter.onFix(
      fix: PositionFix(latitude: 45, longitude: 9, accuracyMeters: 4, timestamp: DateTime(2026, 1, 1)),
      distanceFromRouteMeters: 2,
      instructionCompleted: true,
      instructions: instructions,
    );
    expect(progress.instructionIndex, 1);
  });
}
