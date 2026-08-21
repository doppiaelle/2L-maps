import 'package:flutter_test/flutter_test.dart';
import 'package:twol_maps_spike/navigation_models.dart';
import 'package:twol_maps_spike/saved_itinerary.dart';
import 'package:twol_maps_spike/saved_place.dart';

class _Store implements SavedItineraryStore {
  final items = <String, SavedItinerary>{};
  int failures = 0;
  @override
  Future<List<SavedItinerary>> listForUser(String userId) async =>
      items.values.where((item) => item.userId == userId).toList();
  @override
  Future<SavedItinerary?> findForUser(String userId, String id) async {
    final item = items[id];
    return item?.userId == userId ? item : null;
  }
  @override
  Future<void> upsert(SavedItinerary itinerary) async {
    if (failures > 0) { failures--; throw StateError('temporary'); }
    items[itinerary.id] = itinerary;
  }
  @override
  Future<void> deleteForUser(String userId, String id) async => items.remove(id);
  @override
  Future<void> setFavorite(String userId, String id, bool favorite) async {
    final item = await findForUser(userId, id);
    if (item != null) items[id] = item.copyWith(isFavorite: favorite);
  }
}

SavedItinerary _itinerary({String user = 'u', String id = 'r'}) =>
    SavedItinerary(
      id: id,
      userId: user,
      name: 'Giro',
      notes: 'nota',
      labels: const ['lavoro'],
      updatedAt: DateTime.utc(2026, 1, 1),
      stops: const [
        SavedPlace(id: 'a', addressText: 'Via A', label: 'A'),
        SavedPlace(id: 'b', addressText: 'Via B', note: 'B'),
      ],
    );

void main() {
  test('durable payload preserves authored ordered content without coordinates', () {
    final json = _itinerary().toUserContentJson();
    expect(json['name'], 'Giro');
    expect(json['notes'], 'nota');
    expect(json['labels'], ['lavoro']);
    expect((json['stops'] as List).map((item) => item['order']), [0, 1]);
    expect((json['stops'] as List).first['address_text'], 'Via A');
    expect(json.toString(), isNot(contains('latitude')));
  });

  test('repository isolates users, favorites, duplicates and retries writes', () async {
    final store = _Store()..failures = 2;
    final repo = SavedItineraryRepository(store, userId: 'u', idFactory: () => 'copy');
    await repo.save(_itinerary());
    expect((await repo.list()).single.userId, 'u');
    await repo.setFavorite('r', true);
    expect((await repo.find('r'))!.isFavorite, isTrue);
    final copy = await repo.duplicate('r');
    expect(copy.id, 'copy');
    expect((await SavedItineraryRepository(store, userId: 'other').list(), isEmpty);
    expect(() => repo.save(_itinerary(user: 'other')), throwsStateError);
  });

  test('reopen refreshes expired coordinates and always reoptimizes', () async {
    var refreshes = 0;
    var optimizations = 0;
    final reopener = SavedItineraryReopener(
      coordinates: _Refresh(() { refreshes++; }),
      optimizer: _Optimizer(() { optimizations++; }),
    );
    final result = await reopener.reopen(
      _itinerary(),
      now: DateTime.utc(2026, 1, 1),
    );
    expect(result.route.distanceMeters, 42);
    expect(refreshes, 0);
    expect(optimizations, 1);
  });
}

class _Refresh implements ItineraryCoordinateRefresher {
  _Refresh(this.onRefresh);
  final void Function() onRefresh;
  @override
  Future<SavedItinerary> refresh(SavedItinerary itinerary, DateTime now) async {
    onRefresh();
    return itinerary;
  }
}
class _Optimizer implements ItineraryRouteOptimizer {
  _Optimizer(this.onOptimize);
  final void Function() onOptimize;
  @override
  Future<HereRouteResult> optimize(SavedItinerary itinerary) async {
    onOptimize();
    return const HereRouteResult(
      polyline: 'p', distanceMeters: 42, durationSeconds: 10, instructions: []);
  }
}
