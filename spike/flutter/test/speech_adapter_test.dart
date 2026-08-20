import 'package:flutter_test/flutter_test.dart';
import '../lib/navigation_models.dart';
import '../lib/speech_adapter.dart';

class FakeSpeech implements SpeechEngine {
  final calls = <String>[];
  @override
  Future<void> speak(String text) async => calls.add(text);
}

void main() {
  test('announcer deduplicates repeated instructions', () async {
    final fake = FakeSpeech();
    final announcer = NavigationAnnouncer(fake);
    const instruction = NavigationInstruction(action: 'turn', distanceMeters: 120);
    await announcer.announce(instruction);
    await announcer.announce(instruction);
    expect(fake.calls, ['turn in 120 meters']);
    announcer.reset();
    await announcer.announce(instruction);
    expect(fake.calls, hasLength(2));
  });

  test('announcer safely supports unavailable engine', () async {
    await NavigationAnnouncer(null).announce(
      const NavigationInstruction(action: 'arrive', distanceMeters: 0),
    );
  });
}
