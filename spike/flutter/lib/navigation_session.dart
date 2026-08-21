import 'map_presenter.dart';
import 'map_rendering.dart';
import 'navigation_models.dart';
import 'navigation_progress.dart';
import 'position_adapter.dart';
import 'speech_adapter.dart';

class NavigationSession {
  NavigationSession({
    required this.progress,
    required this.positionAdapter,
    required this.mapPresenter,
    required this.announcer,
  });

  final NavigationProgress progress;
  final NavigationPositionAdapter positionAdapter;
  final MapPresenter mapPresenter;
  final NavigationAnnouncer announcer;
  bool isActive = false;

  Future<void> start(RouteOverlay overlay) async {
    isActive = true;
    await mapPresenter.present(overlay);
  }

  Future<void> onPosition({
    required PositionFix fix,
    required double distanceFromRouteMeters,
    required bool instructionCompleted,
    required List<NavigationInstruction> instructions,
  }) async {
    if (!isActive) return;
    positionAdapter.onFix(
      fix: fix,
      distanceFromRouteMeters: distanceFromRouteMeters,
      instructionCompleted: instructionCompleted,
      instructions: instructions,
    );
    final current = progress.current(instructions);
    if (current != null) await announcer.announce(current);
    await mapPresenter.followPosition(latitude: fix.latitude, longitude: fix.longitude);
  }

  void stop() {
    isActive = false;
    progress.reset();
    announcer.reset();
  }
}
