import 'navigation_models.dart';

abstract interface class SpeechEngine {
  Future<void> speak(String text);
}

class NavigationAnnouncer {
  NavigationAnnouncer(this.engine);
  final SpeechEngine? engine;
  String? _lastAnnouncement;

  Future<void> announce(NavigationInstruction instruction) async {
    final text = _format(instruction);
    if (text == _lastAnnouncement) return;
    _lastAnnouncement = text;
    await engine?.speak(text);
  }

  void reset() => _lastAnnouncement = null;

  String _format(NavigationInstruction instruction) =>
      '${instruction.action} in ${instruction.distanceMeters.round()} meters';
}
