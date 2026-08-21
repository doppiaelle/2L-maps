import 'dart:async';

import 'location_tracking.dart';
import 'navigation_models.dart';
import 'navigation_session.dart';
import 'position_adapter.dart';

typedef DistanceFromRoute = double Function(PositionFix fix);
typedef InstructionCompletion = bool Function(PositionFix fix);
typedef InstructionsProvider = List<NavigationInstruction> Function();

class NavigationLocationBridge {
  NavigationLocationBridge({
    required this.tracking,
    required this.session,
    required this.distanceFromRoute,
    required this.instructionCompleted,
    required this.instructions,
  });

  final LocationTrackingController tracking;
  final NavigationSession session;
  final DistanceFromRoute distanceFromRoute;
  final InstructionCompletion instructionCompleted;
  final InstructionsProvider instructions;
  DateTime? _lastForwarded;

  void start() => tracking.addListener(_onTrackingChanged);

  void stop() => tracking.removeListener(_onTrackingChanged);

  void _onTrackingChanged() {
    final fix = tracking.latest;
    if (tracking.state != LocationTrackingState.active ||
        fix == null ||
        fix.timestamp == _lastForwarded) {
      return;
    }
    _lastForwarded = fix.timestamp;
    unawaited(
      session.onPosition(
        fix: fix,
        distanceFromRouteMeters: distanceFromRoute(fix),
        instructionCompleted: instructionCompleted(fix),
        instructions: instructions(),
      ),
    );
  }
}
