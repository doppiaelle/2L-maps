import 'package:flutter_test/flutter_test.dart';
import 'package:twol_maps_spike/app_diagnostics.dart';

void main() {
  setUp(AppDiagnostics.clear);

  test('records events in the diagnostic snapshot', () {
    AppDiagnostics.record('test_event');

    expect(AppDiagnostics.snapshot, contains('test_event'));
  });

  test('clear removes recorded events', () {
    AppDiagnostics.record('test_event');

    AppDiagnostics.clear();

    expect(AppDiagnostics.snapshot, isEmpty);
  });
}
