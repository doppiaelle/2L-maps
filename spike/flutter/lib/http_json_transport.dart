import 'dart:convert';
import 'dart:io';

import 'routing_transport.dart';

JsonRequest createJsonRequest({Duration timeout = const Duration(seconds: 15)}) {
  return (uri, {required body, required headers}) async {
    final client = HttpClient();
    try {
      final request = await client.postUrl(uri).timeout(timeout);
      headers.forEach(request.headers.set);
      request.headers.contentType = ContentType.json;
      request.write(body);
      final response = await request.close().timeout(timeout);
      final text = await utf8.decoder.bind(response).join();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw HttpException('HTTP ${response.statusCode}', uri: uri);
      }
      final decoded = jsonDecode(text);
      if (decoded is! Map) throw const FormatException('Expected JSON object');
      return decoded.cast<String, Object?>();
    } finally {
      client.close(force: true);
    }
  };
}
