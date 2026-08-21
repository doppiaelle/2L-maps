import 'saved_place.dart';
import 'navigation_models.dart';

typedef JsonMap = Map<String, Object?>;

class SavedItinerary {
  const SavedItinerary({
    required this.id,
    required this.userId,
    required this.name,
    required this.stops,
    required this.updatedAt,
    this.notes,
    this.labels = const [],
    this.isFavorite = false,
  });

  final String id;
  final String userId;
  final String name;
  final List<SavedPlace> stops;
  final String? notes;
  final List<String> labels;
  final bool isFavorite;
  final DateTime updatedAt;

  bool needsCoordinateRefresh(DateTime now) =>
      stops.any((stop) => stop.needsCoordinateRefresh(now));

  SavedItinerary copyWith({
    String? id,
    String? userId,
    String? name,
    List<SavedPlace>? stops,
    String? notes,
    List<String>? labels,
    bool? isFavorite,
    DateTime? updatedAt,
  }) =>
      SavedItinerary(
        id: id ?? this.id,
        userId: userId ?? this.userId,
        name: name ?? this.name,
        stops: List.unmodifiable(stops ?? this.stops),
        notes: notes ?? this.notes,
        labels: List.unmodifiable(labels ?? this.labels),
        isFavorite: isFavorite ?? this.isFavorite,
        updatedAt: updatedAt ?? this.updatedAt,
      );

  SavedItinerary duplicate({required String newId, String? newName}) =>
      copyWith(
        id: newId,
        name: newName ?? '$name (copia)',
        updatedAt: DateTime.now().toUtc(),
      );

  /// Only user-authored, durable content. Provider coordinates are intentionally
  /// excluded and must be refreshed when missing or expired.
  JsonMap toUserContentJson() => {
        'id': id,
        'user_id': userId,
        'name': name,
        'notes': notes,
        'labels': List<String>.from(labels),
        'is_favorite': isFavorite,
        'stops': [
          for (var i = 0; i < stops.length; i++)
            {
              'order': i,
              ...stops[i].toUserContentJson(),
            },
        ],
        'updated_at': updatedAt.toUtc().toIso8601String(),
      };
}

abstract interface class SavedItineraryStore {
  Future<List<SavedItinerary>> listForUser(String userId);
  Future<SavedItinerary?> findForUser(String userId, String itineraryId);
  Future<void> upsert(SavedItinerary itinerary);
  Future<void> deleteForUser(String userId, String itineraryId);
  Future<void> setFavorite(String userId, String itineraryId, bool favorite);
}

class SavedItineraryRepository {
  SavedItineraryRepository(
    this.store, {
    required this.userId,
    this.maxWriteAttempts = 3,
    this.retryDelay = Duration.zero,
    String Function()? idFactory,
  }) : _idFactory = idFactory ?? _defaultId;

  final SavedItineraryStore store;
  final String userId;
  final int maxWriteAttempts;
  final Duration retryDelay;
  final String Function() _idFactory;

  Future<List<SavedItinerary>> list() => store.listForUser(userId);

  Future<SavedItinerary?> find(String id) => store.findForUser(userId, id);

  Future<SavedItinerary> save(SavedItinerary itinerary) async {
    _assertOwner(itinerary);
    await _retry(() => store.upsert(itinerary));
    return itinerary;
  }

  Future<void> delete(String id) => _retry(() => store.deleteForUser(userId, id));

  Future<void> setFavorite(String id, bool favorite) =>
      _retry(() => store.setFavorite(userId, id, favorite));

  Future<SavedItinerary> duplicate(String id, {String? name}) async {
    final source = await find(id);
    if (source == null) throw StateError('Itinerary not found');
    final copy = source.duplicate(newId: _idFactory(), newName: name);
    await save(copy);
    return copy;
  }

  void _assertOwner(SavedItinerary itinerary) {
    if (itinerary.userId != userId) {
      throw StateError('Itinerary belongs to a different user');
    }
  }

  Future<void> _retry(Future<void> Function() operation) async {
    if (maxWriteAttempts < 1) throw ArgumentError.value(maxWriteAttempts);
    Object? lastError;
    StackTrace? lastStack;
    for (var attempt = 1; attempt <= maxWriteAttempts; attempt++) {
      try {
        await operation();
        return;
      } catch (error, stack) {
        lastError = error;
        lastStack = stack;
        if (attempt < maxWriteAttempts && retryDelay > Duration.zero) {
          await Future<void>.delayed(retryDelay);
        }
      }
    }
    Error.throwWithStackTrace(lastError!, lastStack!);
  }

  static String _defaultId() =>
      DateTime.now().microsecondsSinceEpoch.toRadixString(36);
}

abstract interface class ItineraryCoordinateRefresher {
  Future<SavedItinerary> refresh(SavedItinerary itinerary, DateTime now);
}

abstract interface class ItineraryRouteOptimizer {
  Future<HereRouteResult> optimize(SavedItinerary itinerary);
}

class ReopenedItinerary {
  const ReopenedItinerary({required this.itinerary, required this.route});
  final SavedItinerary itinerary;
  final HereRouteResult route;
}

class SavedItineraryReopener {
  const SavedItineraryReopener({
    required this.coordinates,
    required this.optimizer,
  });

  final ItineraryCoordinateRefresher coordinates;
  final ItineraryRouteOptimizer optimizer;

  Future<ReopenedItinerary> reopen(
    SavedItinerary itinerary, {
    DateTime? now,
  }) async {
    final instant = now ?? DateTime.now().toUtc();
    final prepared = itinerary.needsCoordinateRefresh(instant)
        ? await coordinates.refresh(itinerary, instant)
        : itinerary;
    // Re-optimise on every reopen so traffic/road conditions are current.
    final route = await optimizer.optimize(prepared);
    return ReopenedItinerary(itinerary: prepared, route: route);
  }
}
