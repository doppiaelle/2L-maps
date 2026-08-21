import 'navigation_models.dart';

abstract interface class SpeechEngine {
  Future<void> speak(String text);
}

class NavigationAnnouncer {
  NavigationAnnouncer(
    this.engine, {
    this.enabled = true,
    this.announcementDistancesMeters = const [800, 300, 80],
  });

  final SpeechEngine? engine;
  final bool enabled;
  final List<double> announcementDistancesMeters;
  String? _lastAnnouncement;
  double? _lastDistanceBand;

  Future<void> announce(NavigationInstruction instruction) async {
    if (!enabled || engine == null) return;
    final text = _format(instruction);
    if (text == _lastAnnouncement) return;
    _lastAnnouncement = text;
    await engine!.speak(text);
  }

  Future<void> announceWhenApproaching(NavigationInstruction instruction) async {
    if (!enabled || engine == null) return;
    final band = _distanceBand(instruction.distanceMeters);
    if (band == null || band == _lastDistanceBand) return;
    _lastDistanceBand = band;
    await engine!.speak(_format(instruction));
  }

  void setEnabled(bool value) {
    if (!value) reset();
  }

  void reset() {
    _lastAnnouncement = null;
    _lastDistanceBand = null;
  }

  double? _distanceBand(double meters) {
    for (var i = 0; i < announcementDistancesMeters.length; i++) {
      if (meters <= announcementDistancesMeters[i]) {
        return announcementDistancesMeters[i];
      }
    }
    return null;
  }

  String _format(NavigationInstruction instruction) =>
      '${instruction.action} in ${instruction.distanceMeters.round()} meters';
}
