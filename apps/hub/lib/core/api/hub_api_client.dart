import 'dart:convert';
import 'dart:io';

/// Explicit error raised when a Tester Swarm Hub API request fails.
class HubApiException implements Exception {
  final int statusCode;
  final String code;
  final String message;
  final Object? details;

  const HubApiException({
    required this.statusCode,
    required this.code,
    required this.message,
    this.details,
  });

  @override
  String toString() =>
      'HubApiException(statusCode: $statusCode, code: $code, message: $message)';
}

/// Lightweight HTTP client for Tester Swarm Hub Edge Functions and local server.
class HubApiClient {
  final String baseUrl;
  final String? authToken;
  final HttpClient _httpClient;

  HubApiClient({
    required String baseUrl,
    this.authToken,
    HttpClient? httpClient,
  })  : baseUrl = baseUrl.replaceAll(RegExp(r'/+$'), ''),
        _httpClient = httpClient ?? HttpClient();

  /// Releases underlying socket resources.
  void close({bool force = false}) {
    _httpClient.close(force: force);
  }

  /// Registers or updates the active device for [userId].
  Future<Map<String, dynamic>> registerDevice({
    required String userId,
    required String androidIdHash,
    String? model,
    int? sdkInt,
    String? integrityToken,
  }) async {
    final decoded = await _requestJson(
      method: 'POST',
      path: '/functions/v1/hub-device-register',
      userId: userId,
      body: <String, dynamic>{
        'android_id_hash': androidIdHash,
        'model': ?model,
        'sdk_int': ?sdkInt,
        'integrity_token': ?integrityToken,
      },
    );
    return _expectMap(decoded, '/functions/v1/hub-device-register');
  }

  /// Issues a tracking JWT for [enrollmentId].
  Future<String> fetchTrackingToken({
    required String userId,
    required String enrollmentId,
  }) async {
    final decoded = await _requestJson(
      method: 'POST',
      path: '/functions/v1/hub-tracking-token',
      userId: userId,
      body: <String, dynamic>{'enrollment_id': enrollmentId},
    );
    final map = _expectMap(decoded, '/functions/v1/hub-tracking-token');
    final token = map['token'];
    if (token is String && token.isNotEmpty) {
      return token;
    }
    throw HubApiException(
      statusCode: 200,
      code: 'invalid_payload',
      message: 'Missing token in /functions/v1/hub-tracking-token response',
      details: decoded,
    );
  }

  /// Reports daily installed SDK package presence for [userId].
  Future<Map<String, dynamic>> reportPresence({
    required String userId,
    required List<String> packages,
  }) async {
    final decoded = await _requestJson(
      method: 'POST',
      path: '/functions/v1/hub-presence',
      userId: userId,
      body: <String, dynamic>{'packages': packages},
    );
    return _expectMap(decoded, '/functions/v1/hub-presence');
  }

  /// Publishes a verified app campaign via RPC and returns the campaign ID.
  Future<String> publishCampaign({
    required String userId,
    required String appId,
  }) async {
    final decoded = await _requestJson(
      method: 'POST',
      path: '/rest/v1/rpc/publish_campaign',
      userId: userId,
      body: <String, dynamic>{'p_app_id': appId},
    );
    return _extractId(
      decoded,
      '/rest/v1/rpc/publish_campaign',
      const ['campaign_id', 'campaignId', 'id'],
    );
  }

  /// Enrolls [userId] on [deviceId] into [campaignId] and returns enrollment ID.
  Future<String> enrollInCampaign({
    required String userId,
    required String campaignId,
    required String deviceId,
  }) async {
    final decoded = await _requestJson(
      method: 'POST',
      path: '/rest/v1/rpc/enroll_in_campaign',
      userId: userId,
      body: <String, dynamic>{
        'p_campaign_id': campaignId,
        'p_device_id': deviceId,
      },
    );
    return _extractId(
      decoded,
      '/rest/v1/rpc/enroll_in_campaign',
      const ['enrollment_id', 'enrollmentId', 'id'],
    );
  }

  /// Submits structured tester feedback for [enrollmentId] and returns feedback ID.
  Future<String> submitFeedback({
    required String userId,
    required String enrollmentId,
    required int rating,
    required String liked,
    required String issues,
    required String suggestion,
  }) async {
    final decoded = await _requestJson(
      method: 'POST',
      path: '/rest/v1/rpc/submit_feedback',
      userId: userId,
      body: <String, dynamic>{
        'p_enrollment_id': enrollmentId,
        'p_rating': rating,
        'p_liked': liked,
        'p_issues': issues,
        'p_suggestion': suggestion,
      },
    );
    return _extractId(
      decoded,
      '/rest/v1/rpc/submit_feedback',
      const ['feedback_id', 'feedbackId', 'id'],
    );
  }

  /// Fetches current server state snapshot.
  Future<Map<String, dynamic>> fetchState({String? userId}) async {
    final decoded = await _requestJson(
      method: 'GET',
      path: '/rest/v1/state',
      userId: userId,
    );
    return _expectMap(decoded, '/rest/v1/state');
  }

  Future<dynamic> _requestJson({
    required String method,
    required String path,
    String? userId,
    Map<String, dynamic>? body,
  }) async {
    final normalizedPath = path.startsWith('/') ? path : '/$path';
    final uri = Uri.parse('$baseUrl$normalizedPath');

    late final HttpClientRequest request;
    try {
      request = await _httpClient.openUrl(method, uri);
    } on IOException catch (e) {
      throw HubApiException(
        statusCode: 0,
        code: 'network_error',
        message: 'Failed to connect to $uri: $e',
        details: e,
      );
    }

    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
    if (body != null) {
      request.headers.set(HttpHeaders.contentTypeHeader, 'application/json');
    }
    if (userId != null && userId.isNotEmpty) {
      request.headers.set('x-user-id', userId);
      request.headers.set(
        HttpHeaders.authorizationHeader,
        'Bearer ${authToken ?? userId}',
      );
    } else if (authToken != null && authToken!.isNotEmpty) {
      request.headers.set(
        HttpHeaders.authorizationHeader,
        'Bearer $authToken',
      );
    }

    if (body != null) {
      final bytes = utf8.encode(jsonEncode(body));
      request.contentLength = bytes.length;
      request.add(bytes);
    }

    late final HttpClientResponse response;
    late final String rawBody;
    try {
      response = await request.close();
      rawBody = await utf8.decodeStream(response);
    } on IOException catch (e) {
      throw HubApiException(
        statusCode: 0,
        code: 'network_error',
        message: 'HTTP request failed for $uri: $e',
        details: e,
      );
    } on FormatException catch (e) {
      throw HubApiException(
        statusCode: 0,
        code: 'invalid_encoding',
        message: 'Invalid UTF-8 response from $uri: ${e.message}',
        details: e,
      );
    }

    dynamic decoded;
    if (rawBody.trim().isNotEmpty) {
      try {
        decoded = jsonDecode(rawBody);
      } on FormatException catch (e) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          throw HubApiException(
            statusCode: response.statusCode,
            code: 'invalid_json',
            message: 'Invalid JSON response from $normalizedPath: ${e.message}',
            details: rawBody,
          );
        }
        decoded = null;
      }
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      var code = 'http_${response.statusCode}';
      var message =
          rawBody.trim().isNotEmpty ? rawBody : 'HTTP ${response.statusCode}';
      if (decoded is Map<String, dynamic>) {
        final rawCode = decoded['error'] ?? decoded['code'];
        if (rawCode != null && rawCode.toString().isNotEmpty) {
          code = rawCode.toString();
        }
        final rawMessage =
            decoded['message'] ?? decoded['error_description'] ?? decoded['hint'];
        if (rawMessage != null && rawMessage.toString().isNotEmpty) {
          message = rawMessage.toString();
        }
      }
      throw HubApiException(
        statusCode: response.statusCode,
        code: code,
        message: message,
        details: decoded ?? rawBody,
      );
    }

    return decoded;
  }

  Map<String, dynamic> _expectMap(dynamic decoded, String path) {
    if (decoded is Map<String, dynamic>) {
      return decoded;
    }
    throw HubApiException(
      statusCode: 200,
      code: 'invalid_payload',
      message: 'Expected JSON object from $path',
      details: decoded,
    );
  }

  String _extractId(
    dynamic decoded,
    String path,
    List<String> candidateKeys,
  ) {
    if (decoded is String && decoded.isNotEmpty) {
      return decoded;
    }
    if (decoded is Map<String, dynamic>) {
      for (final key in candidateKeys) {
        final value = decoded[key];
        if (value is String && value.isNotEmpty) {
          return value;
        }
      }
    }
    throw HubApiException(
      statusCode: 200,
      code: 'invalid_payload',
      message: 'Expected identifier string in response from $path',
      details: decoded,
    );
  }
}
