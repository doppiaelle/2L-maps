import 'package:flutter_test/flutter_test.dart';

import 'package:twol_maps_spike/experience_flow.dart';
import 'package:twol_maps_spike/navigation_models.dart';
import 'package:twol_maps_spike/saved_itinerary.dart';
import 'package:twol_maps_spike/saved_place.dart';

SavedItinerary _itinerary(int count) => SavedItinerary(
      id: 'route',
      userId: 'user',
      name: 'Giro',
      updatedAt: DateTime.utc(2026, 1, 1),
      stops: List.generate(
        count,
        (i) => SavedPlace(id: 'stop-$i', addressText: 'Via $i'),
      ),
    );

void main() {
  test('onboarding and authentication lead to planner', () {
    final coordinator = ExperienceCoordinator();
    expect(coordinator.state.phase, ExperiencePhase.onboarding);
    coordinator.completeOnboarding(authenticated: false);
    expect(coordinator.state.phase, ExperiencePhase.unauthenticated);
    coordinator.signedIn();
    expect(coordinator.state.phase, ExperiencePhase.planner);
  });

  test('planner validates itinerary size before optimization', () {
    final coordinator = ExperienceCoordinator();
    coordinator.signedIn();

    coordinator.beginOptimization(_itinerary(1));
    expect(coordinator.state.error, ExperienceError.incompleteItinerary);

    coordinator.beginOptimization(_itinerary(26));
    expect(coordinator.state.error, ExperienceError.itineraryTooLong);

    coordinator.beginOptimization(_itinerary(2));
    expect(coordinator.state.phase, ExperiencePhase.optimizing);
    expect(coordinator.state.error, ExperienceError.none);
  });

  test('route lifecycle reaches navigation and completion', () {
    final coordinator = ExperienceCoordinator();
    coordinator.signedIn();
    coordinator.beginOptimization(_itinerary(2));

    const route = HereRouteResult(
      polyline: 'encoded',
      distanceMeters: 1250,
      durationSeconds: 3660,
      instructions: <NavigationInstruction>[],
    );
    coordinator.routeReady(route);
    expect(coordinator.state.phase, ExperiencePhase.routeReady);
    expect(coordinator.state.route, route);

    coordinator.startNavigation();
    expect(coordinator.state.phase, ExperiencePhase.navigating);
    coordinator.complete();
    expect(coordinator.state.phase, ExperiencePhase.completed);
  });

  test('recoverable errors expose actionable Italian text', () {
    final coordinator = ExperienceCoordinator();
    coordinator.recover(ExperienceError.network);
    expect(coordinator.state.phase, ExperiencePhase.recoverableError);
    expect(coordinator.state.message, ExperienceText.network);

    coordinator.recover(ExperienceError.sessionExpired);
    expect(coordinator.state.message, ExperienceText.sessionExpired);
    coordinator.recover(ExperienceError.noResults);
    expect(coordinator.state.message, ExperienceText.noResults);
  });

  test('formatters keep distance and time compact and readable', () {
    expect(ExperienceCoordinator.formatDistance(80), '80 m');
    expect(ExperienceCoordinator.formatDistance(1250), '1.3 km');
    expect(ExperienceCoordinator.formatDuration(90), '2 min');
    expect(ExperienceCoordinator.formatDuration(3660), '1 h 1 min');
  });

  test('listeners receive state transitions', () {
    final coordinator = ExperienceCoordinator();
    final phases = <ExperiencePhase>[];
    coordinator.addListener((state) => phases.add(state.phase));
    coordinator.signedIn();
    coordinator.openHistory();
    expect(phases, [ExperiencePhase.planner, ExperiencePhase.history]);
  });
}
