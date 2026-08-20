import 'navigation_models.dart';
import 'navigation_progress.dart';

class PositionFix {
  const PositionFix({required this.latitude, required this.longitude, required this.accuracyMeters, required this.timestamp});
  final double latitude;
  final double longitude;
  final double accuracyMeters;
  final DateTime timestamp;
}

abstract interface class PositionSource {
  Stream<PositionFix> get fixes;
}

class NavigationPositionAdapter {
  NavigationPositionAdapter(this.progress);
  final NavigationProgress progress;

  void onFix({
    required PositionFix fix,
    required double distanceFromRouteMeters,
    required bool instructionCompleted,
    required List<NavigationInstruction> instructions,
  }) {
    progress.update(
      distanceFromRouteMeters: distanceFromRouteMeters,
      instructionCompleted: instructionCompleted,
      instructions: instructions,
    );
  }
}
