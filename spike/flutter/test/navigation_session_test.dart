import 'package:flutter_test/flutter_test.dart';
import '../lib/map_presenter.dart';
import '../lib/map_rendering.dart';
import '../lib/navigation_models.dart';
import '../lib/navigation_progress.dart';
import '../lib/navigation_session.dart';
import '../lib/position_adapter.dart';
import '../lib/speech_adapter.dart';

class FakeMap implements MapRenderer {
  int presents = 0;
  @override Future<void> setTheme(MapTheme theme) async {}
  @override Future<void> showRoute(RouteOverlay overlay) async => presents++;
  @override Future<void> setCamera({required latitude, required longitude, required zoom, required double pitch}) async {}
}
class FakeSpeech implements SpeechEngine {
  final calls = <String>[];
  @override Future<void> speak(String text) async => calls.add(text);
}

void main() {
  test('session ignores positions before start and composes subsystems', () async {
    final map = FakeMap();
    final speech = FakeSpeech();
    final session = NavigationSession(
      progress: NavigationProgress(),
      positionAdapter: NavigationPositionAdapter(NavigationProgress()),
      mapPresenter: MapPresenter(map),
      announcer: NavigationAnnouncer(speech),
    );
    const instructions = [NavigationInstruction(action: 'depart', distanceMeters: 10)];
    await session.onPosition(
      fix: PositionFix(latitude: 45, longitude: 9, accuracyMeters: 3, timestamp: DateTime(2026, 1, 1)),
      distanceFromRouteMeters: 1,
      instructionCompleted: false,
      instructions: instructions,
    );
    expect(speech.calls, isEmpty);
    await session.start(const RouteOverlay(polyline: 'p', markers: []));
    expect(map.presents, 1);
    await session.onPosition(
      fix: PositionFix(latitude: 45, longitude: 9, accuracyMeters: 3, timestamp: DateTime(2026, 1, 1)),
      distanceFromRouteMeters: 1,
      instructionCompleted: false,
      instructions: instructions,
    );
    expect(speech.calls, hasLength(1));
  });
}
