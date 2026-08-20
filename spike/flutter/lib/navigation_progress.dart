import 'navigation_models.dart';

class NavigationProgress {
  NavigationProgress({this.offRouteThresholdMeters = 50});
  final double offRouteThresholdMeters;
  int instructionIndex = 0;
  bool recalculateRequested = false;

  NavigationInstruction? current(List<NavigationInstruction> instructions) =>
      instructionIndex < instructions.length ? instructions[instructionIndex] : null;

  void update({required double distanceFromRouteMeters, required bool instructionCompleted, required List<NavigationInstruction> instructions}) {
    if (distanceFromRouteMeters > offRouteThresholdMeters) {
      recalculateRequested = true;
      return;
    }
    recalculateRequested = false;
    if (instructionCompleted && instructionIndex < instructions.length) {
      instructionIndex++;
    }
  }

  void reset() {
    instructionIndex = 0;
    recalculateRequested = false;
  }
}
