import 'dart:convert';
import 'dart:io';

import 'app_diagnostics.dart';
import 'routing_transport.dart';

class JsonRequestException implements Exception {
  const JsonRequestException({
    required this.statusCode,
    required this.uri,
    this.code,
    this.providerStatus,
    this.providerCode,
    this.providerMessage,
  });

  final int statusCode;
  final Uri uri;
  final String? code;
  final int? providerStatus;
  final String? providerCode;
  final String? providerMessage;

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
      final responseBody = decoded is Map
          ? Map<String, Object?>.from(decoded)
          : null;
      final rawError = responseBody?['error'];
      final code = rawError is Map && rawError['code'] is String
          ? rawError['code'] as String
          : null;
      final details = rawError is Map ? rawError['details'] : null;
      final providerStatus =
          details is Map && details['providerStatus'] is num
              ? (details['providerStatus'] as num).toInt()
              : null;
      final providerCode = details is Map && details['providerCode'] is String
          ? details['providerCode'] as String
          : null;
      final providerMessage =
          details is Map && details['providerMessage'] is String
              ? details['providerMessage'] as String
              : null;
      AppDiagnostics.record(
        'http response ${uri.path} status=${response.statusCode}'
        '${code == null ? '' : ' code=$code'}'
        '${providerStatus == null ? '' : ' provider_status=$providerStatus'}'
        '${providerCode == null ? '' : ' provider_code=$providerCode'}'
        '${providerMessage == null ? '' : ' provider_message=$providerMessage'}',
      );
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw JsonRequestException(
          statusCode: response.statusCode,
          uri: uri,
          code: code,
          providerStatus: providerStatus,
          providerCode: providerCode,
          providerMessage: providerMessage,
        );
      }
      if (responseBody == null) {
        throw const FormatException('Expected JSON object');
      }
      return responseBody;
    } catch (error) {
      AppDiagnostics.record('http failure ${uri.path} type=${error.runtimeType}');
      rethrow;
    } finally {
      client.close(force: true);
    }
  };
}