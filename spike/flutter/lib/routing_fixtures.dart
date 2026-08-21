import 'route_models.dart';

List<Stop> makeStops(int count) {
  if (count < 3 || count > 25) throw ArgumentError.value(count, 'count', 'must be between 3 and 25');
  return List.generate(
    count,
    (index) => Stop(
      id: index == 0 ? 'start' : (index == count - 1 ? 'end' : 'stop-$index'),
      latitude: 45 + index * 0.01,
      longitude: 9 + index * 0.01,
    ),
  );
}
