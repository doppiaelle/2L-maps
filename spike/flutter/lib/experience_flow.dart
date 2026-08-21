import 'saved_itinerary.dart';
import 'navigation_models.dart';

enum ExperiencePhase {
  onboarding,
  unauthenticated,
  planner,
  optimizing,
  routeReady,
  navigating,
  history,
  completed,
  recoverableError,
}

enum ExperienceError {
  none,
  network,
  sessionExpired,
  noResults,
  unresolvedStop,
  providerUnavailable,
  itineraryTooLong,
  incompleteItinerary,
  locationPermission,
}

class ExperienceState {
  const ExperienceState({
    required this.phase,
    this.error = ExperienceError.none,
    this.message,
    this.route,
    this.itinerary,
  });

  final ExperiencePhase phase;
  final ExperienceError error;
  final String? message;
  final HereRouteResult? route;
  final SavedItinerary? itinerary;

  ExperienceState copyWith({
    ExperiencePhase? phase,
    ExperienceError? error,
    String? message,
    HereRouteResult? route,
    SavedItinerary? itinerary,
  }) =>
      ExperienceState(
        phase: phase ?? this.phase,
        error: error ?? this.error,
        message: message ?? this.message,
        route: route ?? this.route,
        itinerary: itinerary ?? this.itinerary,
      );
}

class ExperienceText {
  static const onboardingTitle = 'Benvenuto in 2L Maps';
  static const onboardingBody =
      'Crea itinerari, naviga con la mappa Mint e salva i tuoi percorsi.';
  static const emptyPlanner = 'Aggiungi almeno una destinazione per iniziare.';
  static const emptyHistory = 'Non hai ancora itinerari salvati.';
  static const noResults = 'Nessun indirizzo trovato. Prova una ricerca diversa.';
  static const unresolvedStop = 'Una tappa non è stata risolta.';
  static const sessionExpired = 'La sessione è scaduta. Accedi di nuovo.';
  static const providerUnavailable =
      'Il servizio è momentaneamente indisponibile. Riprova tra poco.';
  static const network = 'Connessione assente. Controlla la rete e riprova.';
  static const permission =
      'Per seguire la navigazione è necessario consentire la posizione.';
  static const tooLong = 'L’itinerario supera il limite di tappe consentito.';
  static const incomplete = 'Completa origine e destinazione prima di continuare.';
}

class ExperienceCoordinator {
  ExperienceCoordinator({
    ExperienceState? initial,
    this.maxStops = 25,
  }) : _state = initial ??
            const ExperienceState(phase: ExperiencePhase.onboarding);

  final int maxStops;
  ExperienceState _state;
  final _listeners = <void Function(ExperienceState)>[];

  ExperienceState get state => _state;

  void addListener(void Function(ExperienceState) listener) =>
      _listeners.add(listener);
  void removeListener(void Function(ExperienceState) listener) =>
      _listeners.remove(listener);

  void _emit(ExperienceState value) {
    _state = value;
    for (final listener in List.of(_listeners)) {
      listener(_state);
    }
  }

  void completeOnboarding({required bool authenticated}) => _emit(
        ExperienceState(
          phase: authenticated
              ? ExperiencePhase.planner
              : ExperiencePhase.unauthenticated,
        ),
      );

  void signedIn() => _emit(const ExperienceState(phase: ExperiencePhase.planner));
  void signedOut() => _emit(const ExperienceState(phase: ExperiencePhase.unauthenticated));

  void beginOptimization(SavedItinerary itinerary) {
    if (itinerary.stops.length > maxStops) {
      _error(ExperienceError.itineraryTooLong, ExperienceText.tooLong);
      return;
    }
    if (itinerary.stops.length < 2) {
      _error(ExperienceError.incompleteItinerary, ExperienceText.incomplete);
      return;
    }
    _emit(ExperienceState(
      phase: ExperiencePhase.optimizing,
      itinerary: itinerary,
    ));
  }

  void routeReady(HereRouteResult route) => _emit(_state.copyWith(
        phase: ExperiencePhase.routeReady,
        route: route,
      ));

  void startNavigation() {
    if (_state.route == null) {
      _error(ExperienceError.incompleteItinerary, ExperienceText.incomplete);
      return;
    }
    _emit(_state.copyWith(phase: ExperiencePhase.navigating));
  }

  void openHistory() => _emit(const ExperienceState(phase: ExperiencePhase.history));

  void complete() => _emit(_state.copyWith(phase: ExperiencePhase.completed));

  void recover(ExperienceError error) {
    final message = switch (error) {
      ExperienceError.network => ExperienceText.network,
      ExperienceError.sessionExpired => ExperienceText.sessionExpired,
      ExperienceError.noResults => ExperienceText.noResults,
      ExperienceError.unresolvedStop => ExperienceText.unresolvedStop,
      ExperienceError.providerUnavailable => ExperienceText.providerUnavailable,
      ExperienceError.itineraryTooLong => ExperienceText.tooLong,
      ExperienceError.incompleteItinerary => ExperienceText.incomplete,
      ExperienceError.locationPermission => ExperienceText.permission,
      ExperienceError.none => null,
    };
    _error(error, message);
  }

  static String formatDistance(double meters) {
    if (meters < 1000) return '${meters.round()} m';
    return '${(meters / 1000).toStringAsFixed(1)} km';
  }

  static String formatDuration(double seconds) {
    final minutes = (seconds / 60).round();
    if (minutes < 60) return '${minutes} min';
    final hours = minutes ~/ 60;
    final rest = minutes % 60;
    return rest == 0 ? '${hours} h' : '${hours} h ${rest} min';
  }

  void _error(ExperienceError error, String? message) => _emit(
        ExperienceState(
          phase: ExperiencePhase.recoverableError,
          error: error,
          message: message,
          itinerary: _state.itinerary,
          route: _state.route,
        ),
      );
}
