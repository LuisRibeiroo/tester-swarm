import 'dart:convert';
import 'dart:io';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:testerswarm_hub/core/api/hub_api_client.dart';
import 'package:testerswarm_hub/core/native/hub_native_channel.dart';
import 'package:testerswarm_hub/core/state/hub_controller.dart';
import 'package:testerswarm_hub/main.dart';

void main() {
  testWidgets('Onboarding signs in and awards welcome bonus', (tester) async {
    final controller = HubController(
      nativeChannel: const HubNativeChannel(simulated: true),
    );
    await tester.pumpWidget(TesterSwarmHubApp(controller: controller));

    expect(find.text('Tester Swarm Hub'), findsOneWidget);
    await tester.tap(find.byKey(const Key('google_signin_btn')));
    await tester.pumpAndSettle();

    expect(controller.isAuthenticated, isTrue);
    expect(controller.availablePoints, 135); // 125 seed + 10 welcome
  });

  testWidgets('Tester discovers campaign, joins 4-step flow and checks wallet',
      (tester) async {
    final controller = HubController(
      nativeChannel: const HubNativeChannel(simulated: true),
    );
    await controller.signInWithGoogle();
    await tester.pumpWidget(TesterSwarmHubApp(controller: controller));
    await tester.pumpAndSettle();

    await tester.tap(find.text('BoletoScan OCR'));
    await tester.pumpAndSettle();

    expect(find.text('Regras da campanha'), findsOneWidget);
    await tester.tap(find.byKey(const Key('join_campaign_btn')));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Abrir Google Group e avançar'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Tornar-se testador na Play Store'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Verificar instalação e avançar'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('validate_handshake_btn')));
    await tester.pumpAndSettle();

    expect(find.text('Handshake SDK confirmado · Inscrição ativa ✓'), findsOneWidget);

    await tester.tap(find.text('Ir para Meus Testes'));
    await tester.pumpAndSettle();

    final enr = controller.enrollments.first;
    await tester.tap(find.byKey(Key('launch_session_${enr.id}')));
    await tester.pumpAndSettle();
    expect(controller.pendingPoints, 5);

    await tester.tap(find.text('Carteira'));
    await tester.pumpAndSettle();
    expect(find.textContaining('360 dias'), findsOneWidget);
  });

  testWidgets('Developer validates SDK in 2 steps, publishes campaign and opens report',
      (tester) async {
    final controller = HubController(
      nativeChannel: const HubNativeChannel(simulated: true),
    );
    await controller.signInWithGoogle();
    await tester.pumpWidget(TesterSwarmHubApp(controller: controller));
    await tester.pumpAndSettle();

    // Navigate to My Apps
    await tester.tap(find.text('Meus Apps'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('HabitoLoop'));
    await tester.pumpAndSettle();

    final ownedApp = controller.myApps.first;
    await tester.tap(find.byKey(Key('validate_debug_${ownedApp.id}')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(Key('validate_play_${ownedApp.id}')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(Key('publish_campaign_${ownedApp.id}')));
    await tester.pumpAndSettle();

    expect(controller.availablePoints, 15); // 135 - 120 campaign cost
    expect(controller.campaignForApp(ownedApp.id), isNotNull);

    await tester.tap(find.byKey(Key('report_btn_${ownedApp.id}')));
    await tester.pumpAndSettle();
    expect(find.text('Relatório para Acesso à Produção'), findsOneWidget);
    await tester.tap(find.text('Fechar'));
    await tester.pumpAndSettle();

    // Check Settings and Reddit community link
    await tester.tap(find.byIcon(Icons.arrow_back));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ajustes'));
    await tester.pumpAndSettle();
    expect(find.textContaining('r/AndroidAppTesters'), findsOneWidget);
  });

  testWidgets(
      'HubController integrates with remote API server for device registration, tracking token and presence',
      (tester) async {
    await tester.runAsync(() async {
      await HttpOverrides.runWithHttpOverrides(() async {
        final registerRequests = <Map<String, dynamic>>[];
        final tokenRequests = <Map<String, dynamic>>[];
        final presenceRequests = <Map<String, dynamic>>[];
        final requestHeaders = <String, Map<String, String>>{};

        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        final subscription = server.listen((request) async {
          final rawBody = await utf8.decodeStream(request);
          final body = rawBody.isEmpty
              ? <String, dynamic>{}
              : jsonDecode(rawBody) as Map<String, dynamic>;
          requestHeaders[request.uri.path] = {
            'x-user-id': request.headers.value('x-user-id') ?? '',
            'authorization': request.headers.value('authorization') ?? '',
          };

          request.response.headers.contentType = ContentType.json;
          switch (request.uri.path) {
            case '/functions/v1/hub-device-register':
              registerRequests.add(body);
              request.response.statusCode = HttpStatus.ok;
              request.response.write(
                jsonEncode({'device_id': 'dev-srv-1', 'welcome_awarded': true}),
              );
              break;
            case '/functions/v1/hub-tracking-token':
              tokenRequests.add(body);
              request.response.statusCode = HttpStatus.ok;
              request.response.write(
                jsonEncode({
                  'token': 'eyJhbGciOiJFUzI1NiJ9.mock-es256',
                  'expires_at': '2026-12-01T00:00:00Z',
                }),
              );
              break;
            case '/functions/v1/hub-presence':
              presenceRequests.add(body);
              request.response.statusCode = HttpStatus.ok;
              request.response.write(
                jsonEncode({'day': '2026-11-14', 'recorded': 1}),
              );
              break;
            default:
              request.response.statusCode = HttpStatus.notFound;
              request.response.write(jsonEncode({'error': 'not_found'}));
          }
          await request.response.close();
        });

        final native = FakeHubNativeChannel();
        final apiClient = HubApiClient(
          baseUrl: 'http://127.0.0.1:${server.port}',
        );

        try {
          final controller = HubController(
            nativeChannel: native,
            apiClient: apiClient,
          );

          await controller.signInWithGoogle();
          expect(controller.isAuthenticated, isTrue);
          expect(controller.registeredDeviceId, isNotNull);
          expect(controller.registeredDeviceId, 'dev-srv-1');
          expect(registerRequests, hasLength(1));
          expect(
            registerRequests.single['android_id_hash'],
            'android-id-hash-mock',
          );
          expect(
            requestHeaders['/functions/v1/hub-device-register']?['x-user-id'],
            'user-owner-1',
          );

          final enr = controller.enrollments.first;
          final activated =
              await controller.validateHandshakeAndActivate(enr.id);
          expect(activated, isTrue);

          await controller.recordForegroundSession(enr.id, 65);
          expect(controller.pendingPoints, 5);

          expect(tokenRequests, hasLength(2));
          expect(
            tokenRequests.every((r) => r['enrollment_id'] == enr.id),
            isTrue,
          );

          expect(native.savedTokens, hasLength(2));
          expect(
            native.savedTokens.every(
              (call) =>
                  call.packageName == enr.campaign.app.packageName &&
                  call.token == 'eyJhbGciOiJFUzI1NiJ9.mock-es256',
            ),
            isTrue,
          );

          expect(native.launchedTokens, hasLength(2));
          expect(
            native.launchedTokens.every(
              (call) =>
                  call.packageName == enr.campaign.app.packageName &&
                  call.token == 'eyJhbGciOiJFUzI1NiJ9.mock-es256',
            ),
            isTrue,
          );

          expect(presenceRequests, hasLength(1));
          expect(
            presenceRequests.single['packages'],
            [enr.campaign.app.packageName],
          );
        } finally {
          apiClient.close(force: true);
          await subscription.cancel();
          await server.close(force: true);
        }
      }, _RealHttpOverrides());
    });
  });
}

class _RealHttpOverrides extends HttpOverrides {}

class FakeHubNativeChannel extends HubNativeChannel {
  FakeHubNativeChannel() : super(simulated: true);

  final List<({String packageName, String token})> savedTokens = [];
  final List<({String packageName, String token})> launchedTokens = [];

  @override
  Future<DeviceIdentity> getDeviceIdentity() async {
    return const DeviceIdentity(
      androidIdHash: 'android-id-hash-mock',
      model: 'Pixel 8 Mock',
      sdkInt: 35,
    );
  }

  @override
  Future<void> saveTrackingToken(String packageName, String token) async {
    savedTokens.add((packageName: packageName, token: token));
  }

  @override
  Future<bool> launchWithToken(String packageName, String token) async {
    await saveTrackingToken(packageName, token);
    launchedTokens.add((packageName: packageName, token: token));
    return true;
  }
}
