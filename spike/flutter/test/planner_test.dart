import 'package:flutter_test/flutter_test.dart';
import '../lib/planner.dart';
import '../lib/routing_config.dart';
import '../lib/search_transport.dart';

Future<Map<String, Object?>> fakeRequest(Uri uri, {required String body, required Map<String, String> headers}) async => {
  'suggestions': [
    {'address': 'Via Roma 1', 'latitude': 41.9, 'longitude': 12.5},
  ],
};

void main() {
  test('planner debounces and ignores stale results', () async {
    final planner = PlannerController(search: SupabaseSearchClient(fakeRequest, config: const RoutingConfig(supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon')));
    planner.query('r', accessToken: 'jwt');
    planner.query('roma', accessToken: 'jwt');
    await Future<void>.delayed(const Duration(milliseconds: 350));
    expect(planner.suggestions.single.address, 'Via Roma 1');
    planner.dispose();
  });
  test('planner stores resolved start and clears suggestions', () {
    final planner = PlannerController(
      search: SupabaseSearchClient(
        fakeRequest,
        config: const RoutingConfig(
          supabaseUrl: 'https://example.supabase.co',
          supabaseAnonKey: 'anon',
        ),
      ),
    );
    planner.setStart('Via Roma 1', latitude: 41.9, longitude: 12.5);
    planner.addStop('Colosseo', latitude: 41.89, longitude: 12.49);
    expect(planner.start?.resolved, isTrue);
    expect(planner.stops.single.resolved, isTrue);
    planner.suggestions = const [];
    planner.clearSuggestions();
    expect(planner.suggestions, isEmpty);
    planner.dispose();
  });
  test('planner enforces limits and supports reorder/remove', () {
    final planner = PlannerController(search: SupabaseSearchClient(fakeRequest, config: const RoutingConfig(supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon')), maxStops: 2);
    planner.addStop('A'); planner.addStop('B'); planner.addStop('C');
    expect(planner.stops, hasLength(2));
    planner.reorder(0, 2);
    expect(planner.stops.first.address, 'B');
    planner.removeStop(0);
    expect(planner.stops.single.address, 'A');
    planner.dispose();
  });
}
