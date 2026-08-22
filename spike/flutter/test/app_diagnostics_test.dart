import 'package:flutter_test/flutter_test.dart';
import 'package:twol_maps_spike/app_diagnostics.dart';

void main() {
  setUp(AppDiagnostics.clear);

  test('records events in the diagnostic snapshot', () {
    AppDiagnostics.record('test_event');

    expect(AppDiagnostics.snapshot, contains('test_event'));
  });

  test('redacts credentials from copied diagnostics', () {
    AppDiagnostics.record(
      'request authorization=Bearer secret-token apiKey=private-key password=hunter2',
    );

    expect(AppDiagnostics.snapshot, isNot(contains('secret-token')));
    expect(AppDiagnostics.snapshot, isNot(contains('private-key')));
    expect(AppDiagnostics.snapshot, isNot(contains('hunter2')));
    expect(AppDiagnostics.snapshot, contains('<redacted>'));
  });

  test('clear removes recorded events', () {
    AppDiagnostics.record('test_event');

    AppDiagnostics.clear();

    expect(AppDiagnostics.snapshot, isEmpty);
  });
}
