import 'navigation_models.dart';

enum TurnNavigationStatus { idle, running, paused, completed, stopped }

class TurnNavigationSnapshot {
  const TurnNavigationSnapshot({
    required this.status,
    required this.instructionIndex,
    required this.sectionIndex,
    required this.distanceRemainingMeters,
    required this.durationRemainingSeconds,
    required this.eta,
    this.arrivedAtStop = false,
  });

  final TurnNavigationStatus status;
  final int instructionIndex;
  final int sectionIndex;
  final double distanceRemainingMeters;
  final double durationRemainingSeconds;
  final DateTime eta;
  final bool arrivedAtStop;

  NavigationInstruction? current(List<NavigationInstruction> instructions) =>
      instructionIndex < instructions.length ? instructions[instructionIndex] : null;

  NavigationInstruction? next(List<NavigationInstruction> instructions) =>
      instructionIndex + 1 < instructions.length
          ? instructions[instructionIndex + 1]
          : null;
}

class TurnNavigationController {
  TurnNavigationController({DateTime Function()? clock})
      : _clock = clock ?? DateTime.now;

  final DateTime Function() _clock;
  HereRouteResult? _route;
  TurnNavigationStatus _status = TurnNavigationStatus.idle;
  int _instructionIndex = 0;
  int _sectionIndex = 0;
  double _distanceRemainingMeters = 0;
  double _durationRemainingSeconds = 0;
  DateTime? _eta;
  bool _arrivedAtStop = false;

  HereRouteResult? get route => _route;
  TurnNavigationStatus get status => _status;
  int get instructionIndex => _instructionIndex;
  int get sectionIndex => _sectionIndex;
  double get distanceRemainingMeters => _distanceRemainingMeters;
  double get durationRemainingSeconds => _durationRemainingSeconds;
  DateTime? get eta => _eta;
  bool get arrivedAtStop => _arrivedAtStop;

  NavigationInstruction? get currentInstruction =>
      _route == null || _instructionIndex >= _route!.instructions.length
          ? null
          : _route!.instructions[_instructionIndex];

  NavigationInstruction? get nextInstruction =>
      _route == null || _instructionIndex + 1 >= _route!.instructions.length
          ? null
          : _route!.instructions[_instructionIndex + 1];

  String? get activePolyline {
    final sections = _route?.sectionPolylines ?? const <String>[];
    return sections.isEmpty ? _route?.polyline : sections[_sectionIndex.clamp(0, sections.length - 1)];
  }

  TurnNavigationSnapshot? get snapshot => _eta == null
      ? null
      : TurnNavigationSnapshot(
          status: _status,
          instructionIndex: _instructionIndex,
          sectionIndex: _sectionIndex,
          distanceRemainingMeters: _distanceRemainingMeters,
          durationRemainingSeconds: _durationRemainingSeconds,
          eta: _eta!,
          arrivedAtStop: _arrivedAtStop,
        );

  void start(HereRouteResult route) {
    if (route.instructions.isEmpty) {
      throw const FormatException('Cannot start navigation without turn actions');
    }
    _route = route;
    _status = TurnNavigationStatus.running;
    _instructionIndex = 0;
    _sectionIndex = 0;
    _distanceRemainingMeters = route.distanceMeters;
    _durationRemainingSeconds = route.durationSeconds;
    _eta = _clock().add(Duration(seconds: route.durationSeconds.round()));
    _arrivedAtStop = false;
  }

  void pause() {
    if (_status == TurnNavigationStatus.running) _status = TurnNavigationStatus.paused;
  }

  void resume() {
    if (_status == TurnNavigationStatus.paused) _status = TurnNavigationStatus.running;
  }

  void stop() {
    if (_route == null) return;
    _status = TurnNavigationStatus.stopped;
  }

  void update({
    required double distanceToInstructionMeters,
    required bool instructionCompleted,
    double? distanceRemainingMeters,
    double? durationRemainingSeconds,
    int? sectionIndex,
    bool arrivedAtStop = false,
  }) {
    if (_status != TurnNavigationStatus.running || _route == null) return;
    if (distanceToInstructionMeters < 0) {
      throw ArgumentError.value(distanceToInstructionMeters, 'distanceToInstructionMeters');
    }
    if (instructionCompleted && _instructionIndex < _route!.instructions.length) {
      _instructionIndex++;
    }
    if (sectionIndex != null) {
      final maxSection = (_route!.sectionPolylines.length - 1).clamp(0, 1 << 30);
      _sectionIndex = sectionIndex.clamp(0, maxSection).toInt();
    } else if (_route!.sectionPolylines.isNotEmpty &&
        _instructionIndex >= _route!.instructions.length) {
      _sectionIndex = (_route!.sectionPolylines.length - 1);
    }
    if (distanceRemainingMeters != null) {
      _distanceRemainingMeters = distanceRemainingMeters.clamp(0, _route!.distanceMeters).toDouble();
    }
    if (durationRemainingSeconds != null) {
      _durationRemainingSeconds = durationRemainingSeconds.clamp(0, _route!.durationSeconds).toDouble();
      _eta = _clock().add(Duration(seconds: _durationRemainingSeconds.round()));
    }
    if (arrivedAtStop || (_instructionIndex >= _route!.instructions.length && _distanceRemainingMeters <= 1)) {
      _arrivedAtStop = true;
      _status = TurnNavigationStatus.completed;
    }
  }

  static TurnNavigationController restore(
    HereRouteResult route,
    Map<String, Object?> data, {
    DateTime Function()? clock,
  }) {
    final controller = TurnNavigationController(clock: clock);
    controller.start(route);
    controller._status = TurnNavigationStatus.values.firstWhere(
      (value) => value.name == data['status'],
      orElse: () => TurnNavigationStatus.paused,
    );
    controller._instructionIndex = (data['instructionIndex'] as num?)?.toInt() ?? 0;
    controller._sectionIndex = (data['sectionIndex'] as num?)?.toInt() ?? 0;
    controller._distanceRemainingMeters =
        (data['distanceRemainingMeters'] as num?)?.toDouble() ?? route.distanceMeters;
    controller._durationRemainingSeconds =
        (data['durationRemainingSeconds'] as num?)?.toDouble() ?? route.durationSeconds;
    final eta = data['eta'];
    controller._eta = eta is String ? DateTime.tryParse(eta) : controller._eta;
    controller._arrivedAtStop = data['arrivedAtStop'] == true;
    return controller;
  }

  Map<String, Object?> toJson() => {
        'status': _status.name,
        'instructionIndex': _instructionIndex,
        'sectionIndex': _sectionIndex,
        'distanceRemainingMeters': _distanceRemainingMeters,
        'durationRemainingSeconds': _durationRemainingSeconds,
        'eta': _eta?.toIso8601String(),
        'arrivedAtStop': _arrivedAtStop,
      };
}
