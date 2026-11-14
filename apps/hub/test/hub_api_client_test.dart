import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:testerloop_hub/core/api/hub_api_client.dart';
import 'package:testerloop_hub/core/native/hub_native_channel.dart';
import 'package:testerloop_hub/core/state/hub_controller.dart';

class _RealHttpOverrides extends HttpOverrides {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('HubApiClient strips trailing slashes and supports RPC and state endpoints',
      () async {
    await HttpOverrides.runWithHttpOverrides(() async {
      final requests = <({String method, String path, Map<String, dynamic>? body, String? userId, String? auth})>[];
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final subscription = server.listen((request) async {
        final raw = await utf8.decodeStream(request);
        final body =
            raw.isEmpty ? null : jsonDecode(raw) as Map<String, dynamic>;
        requests.add((
          method: request.method,
          path: request.uri.path,
          body: body,
          userId: request.headers.value('x-user-id'),
          auth: request.headers.value('authorization'),
        ));

        request.response.headers.contentType = ContentType.json;
        switch (request.uri.path) {
          case '/rest/v1/rpc/publish_campaign':
            request.response.statusCode = HttpStatus.ok;
            request.response.write(jsonEncode('camp-123'));
            break;
          case '/rest/v1/rpc/enroll_in_campaign':
            request.response.statusCode = HttpStatus.ok;
            request.response.write(jsonEncode({'enrollment_id': 'enr-456'}));
            break;
          case '/rest/v1/rpc/submit_feedback':
            request.response.statusCode = HttpStatus.ok;
            request.response.write(jsonEncode({'id': 'fb-789'}));
            break;
          case '/rest/v1/state':
            request.response.statusCode = HttpStatus.ok;
            request.response.write(jsonEncode({'campaigns': [], 'devices': []}));
            break;
          case '/functions/v1/hub-tracking-token':
            request.response.statusCode = HttpStatus.forbidden;
            request.response.write(
              jsonEncode({'error': 'forbidden', 'message': 'Enrollment mismatch'}),
            );
            break;
          default:
            request.response.statusCode = HttpStatus.notFound;
            request.response.write(jsonEncode({'error': 'not_found'}));
        }
        await request.response.close();
      });

      final client = HubApiClient(
        baseUrl: 'http://127.0.0.1:${server.port}///',
      );
      expect(client.baseUrl, 'http://127.0.0.1:${server.port}');

      try {
        final campaignId = await client.publishCampaign(
          userId: 'user-owner-1',
          appId: 'app-1',
        );
        expect(campaignId, 'camp-123');

        final enrollmentId = await client.enrollInCampaign(
          userId: 'user-tester-1',
          campaignId: 'camp-123',
          deviceId: 'dev-1',
        );
        expect(enrollmentId, 'enr-456');

        final feedbackId = await client.submitFeedback(
          userId: 'user-tester-1',
          enrollmentId: 'enr-456',
          rating: 5,
          liked: 'Fast startup',
          issues: 'None',
          suggestion: 'Add dark widget',
        );
        expect(feedbackId, 'fb-789');

        final state = await client.fetchState();
        expect(state['campaigns'], isA<List<dynamic>>());

        await expectLater(
          () => client.fetchTrackingToken(
            userId: 'user-tester-1',
            enrollmentId: 'enr-456',
          ),
          throwsA(
            isA<HubApiException>()
                .having((e) => e.statusCode, 'statusCode', 403)
                .having((e) => e.code, 'code', 'forbidden')
                .having((e) => e.message, 'message', 'Enrollment mismatch'),
          ),
        );

        expect(requests[0].body, {'p_app_id': 'app-1'});
        expect(requests[0].userId, 'user-owner-1');
        expect(requests[0].auth, 'Bearer user-owner-1');
        expect(requests[1].body, {
          'p_campaign_id': 'camp-123',
          'p_device_id': 'dev-1',
        });
        expect(requests[2].body, {
          'p_enrollment_id': 'enr-456',
          'p_rating': 5,
          'p_liked': 'Fast startup',
          'p_issues': 'None',
          'p_suggestion': 'Add dark widget',
        });
        expect(requests[3].method, 'GET');
        expect(requests[3].path, '/rest/v1/state');
      } finally {
        client.close(force: true);
        await subscription.cancel();
        await server.close(force: true);
      }
    }, _RealHttpOverrides());
  });

  test('HubController returns false without fallback when fetchTrackingToken fails',
      () async {
    await HttpOverrides.runWithHttpOverrides(() async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final subscription = server.listen((request) async {
        request.response.headers.contentType = ContentType.json;
        request.response.statusCode = HttpStatus.forbidden;
        request.response.write(
          jsonEncode({'error': 'forbidden', 'message': 'Not allowed'}),
        );
        await request.response.close();
      });

      final client = HubApiClient(baseUrl: 'http://127.0.0.1:${server.port}');
      try {
        final controller = HubController(
          nativeChannel: const HubNativeChannel(simulated: true),
          apiClient: client,
        );
        final enr = controller.startEnrollment(controller.campaigns.first);
        final activated = await controller.validateHandshakeAndActivate(enr.id);

        expect(activated, isFalse);
        expect(
          controller.enrollmentForCampaign(enr.campaign.id)?.status.name,
          'pending',
        );
      } finally {
        client.close(force: true);
        await subscription.cancel();
        await server.close(force: true);
      }
    }, _RealHttpOverrides());
  });

  test('HubNativeChannel calls saveTrackingToken before launchWithToken on Android',
      () async {
    const channel = MethodChannel('io.testerloop.hub/native');
    final recordedCalls = <({String method, Object? arguments})>[];
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

    messenger.setMockMethodCallHandler(channel, (call) async {
      recordedCalls.add((method: call.method, arguments: call.arguments));
      if (call.method == 'launchWithToken') return true;
      return null;
    });

    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    try {
      const native = HubNativeChannel();
      final launched = await native.launchWithToken('io.focuspod.timer', 'jwt-123');
      expect(launched, isTrue);
      expect(recordedCalls.map((c) => c.method).toList(), [
        'saveTrackingToken',
        'launchWithToken',
      ]);
      expect(recordedCalls[0].arguments, {
        'packageName': 'io.focuspod.timer',
        'token': 'jwt-123',
      });
      expect(recordedCalls[1].arguments, {
        'packageName': 'io.focuspod.timer',
        'token': 'jwt-123',
      });
    } finally {
      debugDefaultTargetPlatformOverride = null;
      messenger.setMockMethodCallHandler(channel, null);
    }
  });
}
