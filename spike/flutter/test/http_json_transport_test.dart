import 'package:flutter_test/flutter_test.dart';
import '../lib/http_json_transport.dart';

void main() {
  test('creates an injectable JSON request function', () {
    final request = createJsonRequest();
    expect(request, isNotNull);
  });
}
