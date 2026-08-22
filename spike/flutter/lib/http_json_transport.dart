import 'dart:convert';
import 'dart:io';

import 'app_diagnostics.dart';
import 'routing_transport.dart';

class JsonRequestException implements Exception {
  const JsonRequestException({
    required this.statusCode,
    required this.uri,
    this.code,
  });

  final int statusCode;
  final Uri uri;
  final String? code;

  @override
  String toString() =>
      'JSON request failed with HTTP $statusCode'
      '${code == null ? '' : ' ($code)'}';
}

JsonRequest createJsonRequest({
  Duration timeout = const Duration(seconds: 15),
}) {
  return (uri, {required body, required headers}) async {
    final client = HttpClient();
    AppDiagnostics.record('http request ${uri.path}');
    try {
      final request = await client.postUrl(uri).timeout(timeout);
      headers.forEach(request.headers.set);
      request.headers.contentType = ContentType.json;
      request.write(body);
      final response = await request.close().timeout(timeout);
      final text = await utf8.decoder.bind(response).join();
      final decoded = jsonDecode(text);
      final body = decoded is Map ? decoded.cast<String, Object?>() : null;
      final rawError = body?['error'];
      final code = rawError is Map && rawError['code'] is String
          ? rawError['code'] as String
          : null;
      AppDiagnostics.record(
        'http response ${uri.path} status=${response.statusCode}'
        '${code == null ? '' : ' code=$code'}',
      );
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw JsonRequestException(
          statusCode: response.statusCode,
          uri: uri,
          code: code,
        );
      }
      if (body == null) throw const FormatException('Expected JSON object');
      return body;
    } catch (error) {
      AppDiagnostics.record('http failure ${uri.path} type=${error.runtimeType}');
      rethrow;
    } finally {
      client.close(force: true);
    }
  };
}